import {env} from "cloudflare:workers";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

type HttpMetadata={contentType?:string};
type PutOptions={
  httpMetadata?:HttpMetadata;
  onlyIf?:{etagMatches?:string;etagDoesNotMatch?:"*"};
};
type ListOptions={prefix?:string;cursor?:string;limit?:number};

export type ObjectBody={
  etag:string;
  httpMetadata?:HttpMetadata;
  json<T>():Promise<T>;
  text():Promise<string>;
  arrayBuffer():Promise<ArrayBuffer>;
};
export type ObjectHead={etag:string;httpMetadata?:HttpMetadata};
export type ObjectStore={
  get(key:string):Promise<ObjectBody|null>;
  head(key:string):Promise<ObjectHead|null>;
  put(key:string,value:string|ArrayBuffer|ArrayBufferView,options?:PutOptions):Promise<{etag:string}|null>;
  delete(keys:string|string[]):Promise<void>;
  list(options?:ListOptions):Promise<{objects:{key:string;etag?:string;uploaded:Date}[];truncated:boolean;cursor?:string}>;
};

const cleanEtag=(value?:string)=>value?.replace(/^"|"$/g,"")||"";
const quotedEtag=(value:string)=>value.startsWith('"')?value:'"'+value+'"';

function s3Config(){
  const e=env as Record<string,string|undefined>;
  const endpoint=e.S3_ENDPOINT?.trim();
  const region=e.S3_REGION?.trim()||"auto";
  const bucket=e.S3_BUCKET?.trim();
  const accessKeyId=e.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey=e.S3_SECRET_ACCESS_KEY?.trim();
  if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)return null;
  return {endpoint,region,bucket,accessKeyId,secretAccessKey};
}

function upstashConfig(){
  const e=env as Record<string,string|undefined>;
  const url=(e.UPSTASH_REDIS_REST_URL||e.DREAMCARS_CLOUD_KV_URL)?.trim().replace(/\/+$/,"");
  const token=(e.UPSTASH_REDIS_REST_TOKEN||e.DREAMCARS_CLOUD_KV_TOKEN)?.trim();
  if(!url||!token)return null;
  return {url,token};
}

type StoredUpstashEntry={
  etag:string;
  contentType?:string;
  uploaded:string;
  encoding:"utf8"|"base64";
  data:string;
};

let cachedUpstash:{key:string;store:ObjectStore}|null=null;

function upstashStore():ObjectStore|null{
  const config=upstashConfig();
  if(!config)return null;
  const cacheKey=`${config.url}|${config.token}`;
  if(cachedUpstash?.key===cacheKey)return cachedUpstash.store;

  const call=async <T>(command:string[]):Promise<T>=>{
    const res=await fetch(config.url,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${config.token}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(command)
    });
    if(!res.ok)throw new Error(`Upstash error ${res.status}`);
    const payload=(await res.json()) as {result:T;error?:string};
    if(payload.error)throw new Error(payload.error);
    return payload.result;
  };

  const toBytes=(entry:StoredUpstashEntry):Uint8Array=>{
    if(entry.encoding==="base64"){
      const bin=atob(entry.data);
      const out=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(entry.data);
  };

  const store:ObjectStore={
    async get(key){
      const raw=await call<string|null>(["GET",`dc:obj:${key}`]);
      if(!raw)return null;
      const entry=JSON.parse(raw) as StoredUpstashEntry;
      return {
        etag:entry.etag,
        httpMetadata:{contentType:entry.contentType},
        async text(){
          return entry.encoding==="utf8"?entry.data:new TextDecoder().decode(toBytes(entry));
        },
        async json<T>(){
          const txt=entry.encoding==="utf8"?entry.data:new TextDecoder().decode(toBytes(entry));
          return JSON.parse(txt) as T;
        },
        async arrayBuffer(){
          const bytes=toBytes(entry);
          return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
        }
      };
    },
    async head(key){
      const raw=await call<string|null>(["GET",`dc:obj:${key}`]);
      if(!raw)return null;
      const entry=JSON.parse(raw) as StoredUpstashEntry;
      return {etag:entry.etag,httpMetadata:{contentType:entry.contentType}};
    },
    async put(key,value,options){
      const redisKey=`dc:obj:${key}`;
      if(options?.onlyIf){
        const existingRaw=await call<string|null>(["GET",redisKey]);
        const existing=existingRaw?(JSON.parse(existingRaw) as StoredUpstashEntry):null;
        if(options.onlyIf.etagDoesNotMatch==="*"&&existing)return null;
        if(options.onlyIf.etagMatches&&(!existing||existing.etag!==options.onlyIf.etagMatches))return null;
      }
      const etag=crypto.randomUUID();
      let encoding:"utf8"|"base64"="utf8";
      let data="";
      if(typeof value==="string"){
        data=value;
      }else{
        encoding="base64";
        const bytes=value instanceof ArrayBuffer
          ?new Uint8Array(value)
          :new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
        let bin="";
        for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
        data=btoa(bin);
      }
      const entry:StoredUpstashEntry={
        etag,
        contentType:options?.httpMetadata?.contentType,
        uploaded:new Date().toISOString(),
        encoding,
        data
      };
      await call(["SET",redisKey,JSON.stringify(entry)]);
      return {etag};
    },
    async delete(keys){
      const list=Array.isArray(keys)?keys:[keys];
      if(!list.length)return;
      await call(["DEL",...list.map(k=>`dc:obj:${k}`)]);
    },
    async list(options={}){
      const prefix=`dc:obj:${options.prefix||""}`;
      const matched=await call<string[]>(["KEYS",`${prefix}*`]);
      const sorted=matched.sort();
      const objects=sorted.map(rk=>({
        key:rk.slice("dc:obj:".length),
        uploaded:new Date()
      }));
      return {objects,truncated:false};
    }
  };
  cachedUpstash={key:cacheKey,store};
  return store;
}

let cachedS3:{key:string;store:ObjectStore}|null=null;

function s3Store():ObjectStore|null{
  const config=s3Config();
  if(!config)return null;
  const cacheKey=[config.endpoint,config.region,config.bucket,config.accessKeyId].join("|");
  if(cachedS3?.key===cacheKey)return cachedS3.store;
  const client=new S3Client({
    endpoint:config.endpoint,
    region:config.region,
    forcePathStyle:true,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey}
  });
  const store:ObjectStore={
    async get(key){
      try{
        const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}));
        if(!result.Body)return null;
        let cached:Promise<Uint8Array>|null=null;
        const bytes=()=>cached??=result.Body!.transformToByteArray();
        return {
          etag:cleanEtag(result.ETag),
          httpMetadata:{contentType:result.ContentType},
          async text(){return new TextDecoder().decode(await bytes());},
          async json<T>(){return JSON.parse(new TextDecoder().decode(await bytes())) as T;},
          async arrayBuffer(){
            const value=await bytes();
            return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength) as ArrayBuffer;
          }
        };
      }catch(error){
        const status=(error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
        if(status===404)return null;
        throw error;
      }
    },
    async head(key){
      try{
        const result=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:key}));
        return {etag:cleanEtag(result.ETag),httpMetadata:{contentType:result.ContentType}};
      }catch(error){
        const status=(error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
        if(status===404)return null;
        throw error;
      }
    },
    async put(key,value,options){
      const body=typeof value==="string"
        ?value
        :value instanceof ArrayBuffer
          ?new Uint8Array(value)
          :new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
      try{
        const result=await client.send(new PutObjectCommand({
          Bucket:config.bucket,
          Key:key,
          Body:body,
          ContentType:options?.httpMetadata?.contentType,
          IfMatch:options?.onlyIf?.etagMatches?quotedEtag(options.onlyIf.etagMatches):undefined,
          IfNoneMatch:options?.onlyIf?.etagDoesNotMatch
        }));
        return {etag:cleanEtag(result.ETag)};
      }catch(error){
        const status=(error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
        if(status===409||status===412)return null;
        throw error;
      }
    },
    async delete(keys){
      const list=Array.isArray(keys)?keys:[keys];
      if(!list.length)return;
      if(list.length===1){
        await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:list[0]}));
        return;
      }
      await client.send(new DeleteObjectsCommand({
        Bucket:config.bucket,
        Delete:{Objects:list.map(Key=>({Key})),Quiet:true}
      }));
    },
    async list(options={}){
      const result=await client.send(new ListObjectsV2Command({
        Bucket:config.bucket,
        Prefix:options.prefix,
        ContinuationToken:options.cursor,
        MaxKeys:options.limit
      }));
      return {
        objects:(result.Contents||[]).flatMap(item=>item.Key?[{key:item.Key,etag:cleanEtag(item.ETag),uploaded:item.LastModified||new Date()}]:[]),
        truncated:Boolean(result.IsTruncated),
        cursor:result.NextContinuationToken
      };
    }
  };
  cachedS3={key:cacheKey,store};
  return store;
}

export function configuredObjectStore():ObjectStore|null{
  const externalS3=s3Store();
  if(externalS3)return externalS3;
  const externalUpstash=upstashStore();
  if(externalUpstash)return externalUpstash;
  const e=env as Record<string,string|undefined>;
  if(e.DREAMCARS_REQUIRE_DURABLE_STORAGE==="true")return null;
  return env.BUCKET?env.BUCKET as unknown as ObjectStore:null;
}

export function storageMode():"s3"|"upstash"|"r2-binding"|"unavailable"{
  if(s3Config())return "s3";
  if(upstashConfig())return "upstash";
  const e=env as Record<string,string|undefined>;
  if(e.DREAMCARS_REQUIRE_DURABLE_STORAGE==="true")return "unavailable";
  return env.BUCKET?"r2-binding":"unavailable";
}
