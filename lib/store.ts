import { env } from "cloudflare:workers";
import seedVehicles from "../data/vehicles.json";
import seedSettings from "../data/settings.json";
import type { Settings, Vehicle } from "./types";

export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function bucket() { if(!env.BUCKET) throw new ApiError(503,"El almacenamiento persistente no está disponible."); return env.BUCKET; }
export async function readDoc<T>(key:string,fallback:T):Promise<{data:T;etag:string|null}> {
  const file=await bucket().get(key);
  return file?{data:await file.json<T>(),etag:file.etag}:{data:fallback,etag:null};
}
export async function writeDoc(key:string,value:unknown,etag:string|null,backup=true) {
  const current=await bucket().get(key);
  if((current?.etag??null)!==etag) throw new ApiError(409,"Este registro cambió. Actualizá la página antes de guardar.");
  if(current&&backup) await bucket().put(`backups/${key}/${Date.now()}-${crypto.randomUUID()}.json`,await current.text(),{httpMetadata:{contentType:"application/json"}});
  const result=await bucket().put(key,JSON.stringify(value,null,2),{
    httpMetadata:{contentType:"application/json; charset=utf-8"},
    onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:"*"}
  });
  if(!result) throw new ApiError(409,"Otro administrador guardó cambios. Actualizá y volvé a intentarlo.");
  return result.etag;
}
export async function listDocs<T>(prefix:string) {
  let cursor:string|undefined; const keys:string[]=[];
  do { const page=await bucket().list({prefix,cursor}); keys.push(...page.objects.map(o=>o.key)); cursor=page.truncated?page.cursor:undefined; } while(cursor);
  const result:(T&{_etag:string})[]=[];
  for(let i=0;i<keys.length;i+=30) {
    const batch=await Promise.all(keys.slice(i,i+30).map(async key=>{const file=await bucket().get(key);return file?{...await file.json<T>(),_etag:file.etag}:null;}));
    for(const v of batch)if(v)result.push(v as T&{_etag:string});
  }
  return result;
}
export async function vehicles() {
  const saved=await listDocs<Vehicle>("vehicles/");
  const merged=new Map<string,Vehicle&{_etag:string|null}>((seedVehicles as Vehicle[]).map(v=>[v.id,{...v,_etag:null}]));
  saved.forEach(v=>merged.set(v.id,v)); return [...merged.values()];
}
export async function settings() {return readDoc<Settings>("settings.json",seedSettings as Settings);}
export async function administrator() {return readDoc<{userId:string;email:string}|null>("private/admin.json",null);}
