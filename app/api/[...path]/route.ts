import {ApiError,bucket,deleteVehicle,listDocs,metrics,readDoc,recordMetric,settings,vehicles,writeDoc} from "../../../lib/store";
import {login,logout,requireAdmin,revokeSessions,sessionInfo,updateAccount} from "../../../lib/admin-auth";
import {credentials,saveCredentials,signature,verifyCredentials} from "../../../lib/cloudinary";
import {vehicleSchema,settingsSchema,inquirySchema} from "../../../lib/validation";
import type {Inquiry,Vehicle} from "../../../lib/types";
export const dynamic="force-dynamic";
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const attempts=new Map<string,{count:number;expires:number}>();

function clientIp(req:Request){
  return req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local-preview";
}

function rate(request:Request,limit:number){
  const key=clientIp(request)+new URL(request.url).pathname;
  const now=Date.now();if(attempts.size>2000)for(const [k,v]of attempts)if(v.expires<now)attempts.delete(k);
  const a=attempts.get(key);if(a&&a.expires>now){if(a.count>=limit)throw new ApiError(429,"Demasiados intentos. Volvé a intentar en unos minutos.");a.count++;}else attempts.set(key,{count:1,expires:now+600000});
}
async function body(req:Request){
  if(!req.headers.get("content-type")?.includes("application/json"))throw new ApiError(415,"Enviá datos JSON.");
  if(Number(req.headers.get("content-length"))>6000000)throw new ApiError(413,"El archivo supera el límite permitido.");
  const reader=req.body?.getReader();if(!reader)throw new ApiError(400,"Faltan los datos JSON.");
  const decoder=new TextDecoder();let size=0,raw="";
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>6000000){await reader.cancel();throw new ApiError(413,"El archivo supera el límite permitido.");}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
  let parsed;try{parsed=JSON.parse(raw);}catch{throw new ApiError(400,"El JSON no es válido.");}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new ApiError(400,"Enviá un objeto JSON válido.");return parsed;
}
async function inquiryLimit(req:Request){
  const ip=clientIp(req);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const window=Math.floor(Date.now()/600000),prefix=`private/limits/${hash}/`;
  const old=await bucket().list({prefix});const expired=old.objects.filter(o=>Number(o.key.slice(prefix.length).split("-")[0])<window).map(o=>o.key);if(expired.length)await bucket().delete(expired);
  for(let i=0;i<5;i++){const key=`${prefix}${window}-${i}.json`;if(await bucket().head(key))continue;
    const reserved=await bucket().put(key,JSON.stringify({expiresAt:(window+1)*600000}),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});if(reserved)return;
  }
  throw new ApiError(429,"Ya recibimos varias consultas tuyas. Esperá unos minutos o escribinos por WhatsApp.");
}
function origin(req:Request){
  const o=req.headers.get("origin");
  if(!o)throw new ApiError(403,"Origen no permitido.");
  const reqUrl=new URL(req.url);
  const fwdProto=req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const fwdHost=req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()||req.headers.get("host")?.trim();
  const expectedOrigins=new Set([reqUrl.origin]);
  if(fwdHost){
    expectedOrigins.add(`${fwdProto||reqUrl.protocol.replace(":","")}://${fwdHost}`);
    expectedOrigins.add(`https://${fwdHost}`);
  }
  if(!expectedOrigins.has(o))throw new ApiError(403,"Origen no permitido.");
  if(req.headers.get("sec-fetch-site")==="cross-site")throw new ApiError(403,"Solicitud no permitida.");
}
function authResponse(result:unknown,cookie:string){return Response.json(result,{headers:{"Cache-Control":"no-store","Set-Cookie":cookie,"X-Content-Type-Options":"nosniff"}});}

async function handle(req:Request){
  try{
    const path=new URL(req.url).pathname.replace(/^\/api\//,"");const method=req.method;
    if(method!=="GET")origin(req);
    if(path==="catalog"&&method==="GET")return json({settings:(await settings()).data,vehicles:(await vehicles()).filter(v=>v.status==="published").map(({_etag,...v})=>v)});
    if(path==="session"&&method==="GET")return json(await sessionInfo(req));
    if(path==="auth/login"&&method==="POST"){const data=await login(req,await body(req));return authResponse(data.result,data.cookie);}
    if(path==="auth/logout"&&method==="POST")return authResponse({ok:true},await logout(req));
    if(path==="auth/account"&&method==="PUT"){const data=await updateAccount(req,await body(req));return authResponse(data.result,data.cookie);}
    if(path==="auth/revoke"&&method==="POST")return authResponse({ok:true},await revokeSessions(req));

    const mediaMatch=path.match(/^media\/([a-zA-Z0-9._-]{1,100})$/);
    if(mediaMatch&&method==="GET"){
      const obj=await bucket().get(`uploads/${mediaMatch[1]}`);
      if(!obj)throw new ApiError(404,"Imagen no encontrada.");
      return new Response(await obj.arrayBuffer(),{
        headers:{
          "Content-Type":obj.httpMetadata?.contentType||"image/webp",
          "Cache-Control":"public, max-age=31536000, immutable",
          "X-Content-Type-Options":"nosniff"
        }
      });
    }

    if(path==="metrics"&&method==="POST"){
      rate(req,60);
      const input=await body(req);
      const vehicleId=typeof input.vehicleId==="string"?input.vehicleId.trim().slice(0,80):"";
      const event=input.event==="whatsapp"?"whatsapp":input.event==="view"?"view":null;
      if(!vehicleId||!event)throw new ApiError(400,"Datos de métrica inválidos.");
      if(!(await vehicles()).some(v=>v.id===vehicleId))throw new ApiError(404,"Vehículo no encontrado.");
      const updated=await recordMetric(vehicleId,event);
      return json({ok:true,metrics:updated});
    }

    if(path==="inquiries"&&method==="POST"){
      rate(req,5);const data=inquirySchema.parse(await body(req));await inquiryLimit(req);
      if(data.vehicleId&&!(await vehicles()).some(v=>v.id===data.vehicleId&&v.status==="published"))throw new ApiError(400,"El vehículo ya no está publicado.");
      const id=crypto.randomUUID();const {website,...clean}=data;
      const record:Inquiry={...clean,id,status:"new",createdAt:new Date().toISOString()};await writeDoc(`inquiries/${id}.json`,record,null,false);return json({ok:true,id},201);
    }
    if(path.startsWith("admin/")){
      await requireAdmin(req);
      if(path==="admin/data"&&method==="GET"){
        const [config,cloud,allVehicles,allInquiries,allMetrics]=await Promise.all([
          settings(),
          credentials(),
          vehicles(),
          listDocs<Inquiry>("inquiries/"),
          metrics()
        ]);
        return json({
          vehicles:allVehicles,
          settings:{...config.data,_etag:config.etag},
          inquiries:allInquiries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
          metrics:allMetrics,
          cloudinary:{configured:!!cloud,cloudName:cloud?.cloudName??""}
        });
      }
      if(path==="admin/upload-local"&&method==="POST"){
        rate(req,60);
        const input=await body(req);
        if(typeof input.dataUrl!=="string")throw new ApiError(400,"Imagen inválida.");
        const matchData=input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp|avif|gif));base64,([A-Za-z0-9+/=]+)$/);
        if(!matchData)throw new ApiError(400,"Formato de imagen no admitido.");
        const mime=matchData[1];
        const ext=mime==="image/webp"?"webp":mime==="image/png"?"png":mime==="image/avif"?"avif":mime==="image/gif"?"gif":"jpg";
        const binaryStr=atob(matchData[2]);
        const bytes=new Uint8Array(binaryStr.length);
        for(let i=0;i<binaryStr.length;i++)bytes[i]=binaryStr.charCodeAt(i);
        if(bytes.byteLength>5*1024*1024)throw new ApiError(413,"La imagen optimizada supera los 5 MB.");
        const fileId=`${crypto.randomUUID()}.${ext}`;
        await bucket().put(`uploads/${fileId}`,bytes,{httpMetadata:{contentType:mime}});
        return json({url:`/api/media/${fileId}`,publicId:`local-${fileId}`});
      }
      const match=path.match(/^admin\/vehicles\/([a-z0-9-]{1,80})$/);
      if(match&&method==="PUT"){
        const input=await body(req);const item=vehicleSchema.parse({...input,id:match[1],updatedAt:new Date().toISOString()});
        const old=await readDoc<Vehicle|null>(`vehicles/${match[1]}.json`,null);if(old.etag!==(input._etag??null))throw new ApiError(409,"La ficha cambió. Actualizá antes de guardar.");
        const cloud=await credentials();
        const currentVehicles=await vehicles();
        for(const img of item.images){
          if(img.url.startsWith("/api/media/")){
            const fname=img.url.slice("/api/media/".length);
            if(!(await bucket().head(`uploads/${fname}`)))throw new ApiError(400,"La foto subida no existe en el servidor.");
          }else if(img.url.startsWith("/media/")){
            if(!currentVehicles.some(v=>v.images.some(i=>i.url===img.url)))throw new ApiError(400,"Elegí una foto subida a Cloudinary.");
          }else if(!cloud||!img.url.startsWith(`https://res.cloudinary.com/${cloud.cloudName}/image/upload/`)){
            throw new ApiError(400,"Las fotos deben pertenecer a tu cuenta de Cloudinary.");
          }
        }
        const etag=await writeDoc(`vehicles/${match[1]}.json`,item,old.etag);return json({...item,_etag:etag});
      }
      if(match&&method==="DELETE"){
        const input=await body(req);
        const old=await readDoc<Vehicle|null>(`vehicles/${match[1]}.json`,null);
        if(old.etag&&old.etag!==(input._etag??null))throw new ApiError(409,"La ficha cambió. Actualizá antes de eliminar.");
        await deleteVehicle(match[1]);
        return json({ok:true});
      }
      if(path==="admin/settings"&&method==="PUT"){
        const input=await body(req);const value=settingsSchema.parse(input);const old=await settings();if(old.etag!==(input._etag??null))throw new ApiError(409,"Los datos del negocio cambiaron. Actualizá antes de guardar.");
        const etag=await writeDoc("settings.json",value,old.etag);return json({...value,_etag:etag});
      }
      const inquiry=path.match(/^admin\/inquiries\/([a-f0-9-]{36})$/);
      if(inquiry&&method==="DELETE"){
        const input=await body(req);const key=`inquiries/${inquiry[1]}.json`;const old=await readDoc<Inquiry|null>(key,null);
        if(!old.data)throw new ApiError(404,"Consulta no encontrada.");
        if(old.etag!==(input._etag??null))throw new ApiError(409,"La consulta cambió. Actualizá antes de eliminar.");
        const copies=await bucket().list({prefix:`backups/${key}/`});
        let cursor:string|undefined=copies.truncated?copies.cursor:undefined;
        if(copies.objects.length)await bucket().delete(copies.objects.map(o=>o.key));
        while(cursor){const page=await bucket().list({prefix:`backups/${key}/`,cursor});if(page.objects.length)await bucket().delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined;}
        await bucket().delete(key);return json({ok:true});
      }
      if(inquiry&&method==="PATCH"){
        const input=await body(req);
        const old=await readDoc<Inquiry|null>(`inquiries/${inquiry[1]}.json`,null);if(!old.data)throw new ApiError(404,"Consulta no encontrada.");
        if(old.etag!==(input._etag??null))throw new ApiError(409,"La consulta cambió. Actualizá antes de guardar.");
        const nextStatus=input.status!==undefined?input.status:old.data.status;
        if(!["new","contacted","closed"].includes(nextStatus))throw new ApiError(400,"Estado inválido.");
        const nextNotes=input.notes!==undefined?String(input.notes).trim().slice(0,2000):old.data.notes;
        const updated:Inquiry={...old.data,status:nextStatus,...(nextNotes!==undefined?{notes:nextNotes}:{})};
        const etag=await writeDoc(`inquiries/${inquiry[1]}.json`,updated,old.etag);return json({...updated,_etag:etag});
      }
      if(path==="admin/cloudinary"&&method==="POST"){
        rate(req,10);const input=await body(req);
        if(!/^[a-zA-Z0-9_-]{1,80}$/.test(input.cloudName)||!/^\d{5,30}$/.test(input.apiKey)||typeof input.apiSecret!=="string"||input.apiSecret.length<10||input.apiSecret.length>200)throw new ApiError(400,"Revisá los datos de Cloudinary.");
        await verifyCredentials(input);await saveCredentials({cloudName:input.cloudName,apiKey:input.apiKey,apiSecret:input.apiSecret});return json({ok:true,cloudName:input.cloudName});
      }
      if(path==="admin/upload-signature"&&method==="POST"){
        rate(req,100);const cloud=await credentials();if(!cloud)throw new ApiError(422,"Conectá Cloudinary en Integraciones antes de subir fotos.");
        const params={timestamp:Math.floor(Date.now()/1000),folder:"dreamcars/vehicles",public_id:crypto.randomUUID(),overwrite:"false"};
        return json({params,signature:await signature(params,cloud.apiSecret),cloudName:cloud.cloudName,apiKey:cloud.apiKey});
      }
      if(path==="admin/backup"&&method==="GET"){
        const clean=<T,>(list:(T&{_etag?:unknown})[])=>list.map(({_etag,...v})=>v);
        const output={schemaVersion:1,exportedAt:new Date().toISOString(),settings:(await settings()).data,vehicles:clean(await vehicles()),inquiries:clean(await listDocs<Inquiry>("inquiries/"))};
        return new Response(JSON.stringify(output,null,2),{headers:{"Content-Type":"application/json","Content-Disposition":`attachment; filename="dreamcars-backup-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"no-store"}});
      }
      if(path==="admin/restore"&&method==="POST"){
        const input=await body(req);if(input.schemaVersion!==1||!Array.isArray(input.vehicles)||input.vehicles.length>500||!Array.isArray(input.inquiries)||input.inquiries.length>2000)throw new ApiError(400,"El respaldo no tiene el formato esperado.");
        const newSettings=settingsSchema.parse(input.settings);const newVehicles=input.vehicles.map((v:unknown)=>vehicleSchema.parse(v));
        if(new Set(newVehicles.map((v:Vehicle)=>v.id)).size!==newVehicles.length)throw new ApiError(400,"Hay identificadores de vehículos repetidos.");
        const newInquiries=input.inquiries.map((q:Inquiry)=>{if(!/^[a-f0-9-]{36}$/.test(q.id)||!["new","contacted","closed"].includes(q.status)||!Number.isFinite(Date.parse(q.createdAt)))throw new ApiError(400,"El respaldo contiene una consulta inválida.");return {...inquirySchema.parse({...q,website:undefined}),id:q.id,status:q.status,createdAt:q.createdAt};});
        const oldSettings=await settings();await writeDoc("settings.json",newSettings,oldSettings.etag);
        for(const v of newVehicles){const old=await readDoc(`vehicles/${v.id}.json`,null);await writeDoc(`vehicles/${v.id}.json`,v,old.etag);}
        for(const q of newInquiries){const old=await readDoc(`inquiries/${q.id}.json`,null);await writeDoc(`inquiries/${q.id}.json`,q,old.etag);}
        return json({ok:true,message:"Respaldo combinado. Se conservaron los registros que no estaban en el archivo."});
      }
    }
    throw new ApiError(404,"Ruta no encontrada.");
  }catch(error){
    if(error instanceof ApiError)return json({error:error.message},error.status);
    if(error&&typeof error==="object"&&"issues" in error)return json({error:"Revisá los campos del formulario.",details:(error as {issues:{message:string;path:unknown[]}[]}).issues.map(i=>`${i.path.join(".")}: ${i.message}`)},400);
    console.error("API request failed",error instanceof Error?error.name:"unknown");return json({error:"No se pudo completar la operación. Intentá de nuevo."},500);
  }
}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
