import {env} from "cloudflare:workers";
import {ApiError,readDoc,writeDoc} from "./store";
type Credentials={cloudName:string;apiKey:string;apiSecret:string};
async function encryptionKey(){
  if(!env.INTEGRATION_ENCRYPTION_KEY)throw new ApiError(503,"Falta configurar la clave de cifrado del servidor.");
  return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(env.INTEGRATION_ENCRYPTION_KEY)),"AES-GCM",false,["encrypt","decrypt"]);
}
export async function credentials():Promise<Credentials|null>{
  if(env.CLOUDINARY_CLOUD_NAME&&env.CLOUDINARY_API_KEY&&env.CLOUDINARY_API_SECRET)return {cloudName:env.CLOUDINARY_CLOUD_NAME,apiKey:env.CLOUDINARY_API_KEY,apiSecret:env.CLOUDINARY_API_SECRET};
  const saved=await readDoc<{iv:number[];data:number[]}|null>("private/cloudinary.json",null);
  if(!saved.data)return null;
  try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(saved.data.iv)},await encryptionKey(),new Uint8Array(saved.data.data))));}
  catch{throw new ApiError(503,"No se pudo abrir la configuración de Cloudinary. Revisá la clave del servidor.");}
}
export async function saveCredentials(value:Credentials){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(),new TextEncoder().encode(JSON.stringify(value)));
  const old=await readDoc("private/cloudinary.json",null);
  await writeDoc("private/cloudinary.json",{iv:[...iv],data:[...new Uint8Array(encrypted)]},old.etag,false);
}
export async function signature(params:Record<string,string|number>,secret:string){
  const data=Object.keys(params).sort().map(k=>`${k}=${params[k]}`).join("&")+secret;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1",new TextEncoder().encode(data)))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function verifyCredentials(c:Credentials){
  const timestamp=Math.floor(Date.now()/1000);const sig=await signature({timestamp},c.apiSecret);
  const form=new FormData();form.set("timestamp",String(timestamp));form.set("api_key",c.apiKey);form.set("signature",sig);
  // An invalid file checks authentication without creating an asset.
  form.set("file",new Blob(["credential-check"],{type:"text/plain"}),"check.txt");
  const response=await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`,{method:"POST",body:form});
  const body=await response.json() as {error?:{message?:string}};
  if(response.status===401||response.status===403||body.error?.message?.match(/api[_ ]key|signature|cloud name|unknown cloud/i))throw new ApiError(400,"Cloudinary rechazó las credenciales. Revisá Cloud name, API key y API secret.");
  if(response.status>=500)throw new ApiError(502,"Cloudinary no está disponible. Intentá de nuevo.");
  if(!body.error?.message?.match(/invalid image|unsupported|image file|invalid file/i))throw new ApiError(400,"No se pudieron validar las credenciales de Cloudinary.");
}
