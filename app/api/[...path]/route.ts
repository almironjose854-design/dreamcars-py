import {env} from "cloudflare:workers";
import {getChatGPTUser} from "../../chatgpt-auth";
import {administrator,ApiError,bucket,listDocs,readDoc,settings,vehicles,writeDoc} from "../../../lib/store";
import {credentials,saveCredentials,signature,verifyCredentials} from "../../../lib/cloudinary";
import {vehicleSchema,settingsSchema,inquirySchema} from "../../../lib/validation";
import type {Inquiry,Vehicle} from "../../../lib/types";
export const dynamic="force-dynamic";
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const attempts=new Map<string,{count:number;expires:number}>();
function rate(request:Request,limit:number){
  const key=(request.headers.get("cf-connecting-ip")||"local")+new URL(request.url).pathname;
  const now=Date.now();if(attempts.size>2000)for(const [k,v]of attempts)if(v.expires<now)attempts.delete(k);
  const a=attempts.get(key);if(a&&a.expires>now){if(a.count>=limit)throw new ApiError(429,"Demasiados intentos. Volvé a intentar en unos minutos.");a.count++;}else attempts.set(key,{count:1,expires:now+600000});
}
async function body(req:Request){
  if(!req.headers.get("content-type")?.includes("application/json"))throw new ApiError(415,"Enviá datos JSON.");
  if(Number(req.headers.get("content-length"))>2000000)throw new ApiError(413,"El archivo supera el límite de 2 MB.");
  const reader=req.body?.getReader();if(!reader)throw new ApiError(400,"Faltan los datos JSON.");
  const decoder=new TextDecoder();let size=0,raw="";
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw new ApiError(413,"El archivo supera el límite de 2 MB.");}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
  try{return JSON.parse(raw);}catch{throw new ApiError(400,"El JSON no es válido.");}
}
async function inquiryLimit(req:Request){
  const ip=req.headers.get("cf-connecting-ip")||"local-preview";
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const window=Math.floor(Date.now()/600000),prefix=`private/limits/${hash}/`;
  const old=await bucket().list({prefix});const expired=old.objects.filter(o=>Number(o.key.slice(prefix.length).split("-")[0])<window).map(o=>o.key);if(expired.length)await bucket().delete(expired);
  for(let i=0;i<5;i++){const key=`${prefix}${window}-${i}.json`;if(await bucket().head(key))continue;
    const reserved=await bucket().put(key,JSON.stringify({expiresAt:(window+1)*600000}),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});if(reserved)return;
  }
  throw new ApiError(429,"Ya recibimos varias consultas tuyas. Esperá unos minutos o escribinos por WhatsApp.");
}
async function requireAdmin(){const user=await getChatGPTUser();const admin=await administrator();if(!user||user.userId!==admin.data?.userId)throw new ApiError(403,"Ingresá con la cuenta administradora.");return user;}
function origin(req:Request){const o=req.headers.get("origin");if(o&&o!==new URL(req.url).origin)throw new ApiError(403,"Origen no permitido.");if(req.headers.get("sec-fetch-site")==="cross-site")throw new ApiError(403,"Solicitud no permitida.");}
async function safeEqual(a:string,b:string){const enc=new TextEncoder();const aa=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(a)));const bb=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(b)));return aa.reduce((v,x,i)=>v|(x^bb[i]),0)===0;}
async function handle(req:Request){
  try{
    const path=new URL(req.url).pathname.replace(/^\/api\//,"");const method=req.method;
    if(method!=="GET")origin(req);
    if(path==="catalog"&&method==="GET")return json({settings:(await settings()).data,vehicles:(await vehicles()).filter(v=>v.status==="published").map(({_etag,...v})=>v)});
    if(path==="session"&&method==="GET"){
      const user=await getChatGPTUser();const admin=await administrator();
      return json({user:user?{email:user.email,displayName:user.displayName}:null,isAdmin:!!user&&user.userId===admin.data?.userId,needsSetup:!admin.data});
    }
    if(path==="setup"&&method==="POST"){
      rate(req,5);const user=await getChatGPTUser();if(!user)throw new ApiError(401,"Iniciá sesión primero.");
      const old=await administrator();if(old.data)throw new ApiError(409,"El administrador ya fue configurado.");
      const input=await body(req);if(!env.ADMIN_SETUP_TOKEN||typeof input.token!=="string"||!await safeEqual(input.token,env.ADMIN_SETUP_TOKEN))throw new ApiError(403,"El código de activación no es correcto.");
      await writeDoc("private/admin.json",{userId:user.userId,email:user.email},null,false);return json({ok:true});
    }
    if(path==="inquiries"&&method==="POST"){
      rate(req,5);const data=inquirySchema.parse(await body(req));await inquiryLimit(req);
      if(data.vehicleId&&!(await vehicles()).some(v=>v.id===data.vehicleId&&v.status==="published"))throw new ApiError(400,"El vehículo ya no está publicado.");
      const id=crypto.randomUUID();const {website,...clean}=data;
      const record:Inquiry={...clean,id,status:"new",createdAt:new Date().toISOString()};await writeDoc(`inquiries/${id}.json`,record,null,false);return json({ok:true,id},201);
    }
    if(path.startsWith("admin/")){
      await requireAdmin();
      if(path==="admin/data"&&method==="GET"){
        const config=await settings();const cloud=await credentials();
        return json({vehicles:await vehicles(),settings:{...config.data,_etag:config.etag},inquiries:(await listDocs<Inquiry>("inquiries/")).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),cloudinary:{configured:!!cloud,cloudName:cloud?.cloudName??""}});
      }
      const match=path.match(/^admin\/vehicles\/([a-z0-9-]{1,80})$/);
      if(match&&method==="PUT"){
        const input=await body(req);const item=vehicleSchema.parse({...input,id:match[1],updatedAt:new Date().toISOString()});
        const old=await readDoc<Vehicle|null>(`vehicles/${match[1]}.json`,null);if(old.etag!==(input._etag??null))throw new ApiError(409,"La ficha cambió. Actualizá antes de guardar.");
        const cloud=await credentials();for(const img of item.images){if(img.url.startsWith("/media/")){if(!(await vehicles()).some(v=>v.images.some(i=>i.url===img.url)))throw new ApiError(400,"Elegí una foto subida a Cloudinary.");}else if(!cloud||!img.url.startsWith(`https://res.cloudinary.com/${cloud.cloudName}/image/upload/`))throw new ApiError(400,"Las fotos deben pertenecer a tu cuenta de Cloudinary.");}
        const etag=await writeDoc(`vehicles/${match[1]}.json`,item,old.etag);return json({...item,_etag:etag});
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
        const input=await body(req);if(!["new","contacted","closed"].includes(input.status))throw new ApiError(400,"Estado inválido.");
        const old=await readDoc<Inquiry|null>(`inquiries/${inquiry[1]}.json`,null);if(!old.data)throw new ApiError(404,"Consulta no encontrada.");
        if(old.etag!==(input._etag??null))throw new ApiError(409,"La consulta cambió. Actualizá antes de guardar.");
        const etag=await writeDoc(`inquiries/${inquiry[1]}.json`,{...old.data,status:input.status},old.etag);return json({...old.data,status:input.status,_etag:etag});
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
