import { env } from "cloudflare:workers";
import seedVehicles from "../data/vehicles.json";
import seedSettings from "../data/settings.json";
import type { Settings, Vehicle, VehicleMetrics } from "./types";

export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function bucket() { if(!env.BUCKET) throw new ApiError(503,"El almacenamiento persistente no está disponible."); return env.BUCKET; }
export async function readDoc<T>(key:string,fallback:T):Promise<{data:T;etag:string|null}> {
  const file=await bucket().get(key);
  return file?{data:await file.json<T>(),etag:file.etag}:{data:fallback,etag:null};
}
export async function writeDoc(key:string,value:unknown,etag:string|null,backup=true) {
  const current=await bucket().get(key);
  if((current?.etag??null)!==etag) throw new ApiError(409,"Este registro cambió. Actualizá la página antes de guardar.");
  if(current&&backup) {
    const backupPrefix=`backups/${key}/`;
    await bucket().put(`${backupPrefix}${Date.now()}-${crypto.randomUUID()}.json`,await current.text(),{httpMetadata:{contentType:"application/json"}});
    const existing=await bucket().list({prefix:backupPrefix});
    if(existing.objects.length>10){
      const sorted=[...existing.objects].sort((a,b)=>a.key.localeCompare(b.key));
      const toDelete=sorted.slice(0,sorted.length-10).map(o=>o.key);
      if(toDelete.length)await bucket().delete(toDelete);
    }
  }
  const result=await bucket().put(key,JSON.stringify(value,null,2),{
    httpMetadata:{contentType:"application/json; charset=utf-8"},
    onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:"*"}
  });
  if(!result) throw new ApiError(409,"Otro administrador guardó cambios. Actualizá y volvé a intentarlo.");
  if(key.startsWith("vehicles/")){
    const vid=key.slice("vehicles/".length).replace(/\.json$/,"");
    const deleted=await readDoc<string[]>("private/deleted-vehicles.json",[]);
    if(deleted.data.includes(vid)){
      await bucket().put("private/deleted-vehicles.json",JSON.stringify(deleted.data.filter(x=>x!==vid)),{httpMetadata:{contentType:"application/json"}});
    }
  }
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
  const [saved,deleted]=await Promise.all([
    listDocs<Vehicle>("vehicles/"),
    readDoc<string[]>("private/deleted-vehicles.json",[])
  ]);
  const deletedSet=new Set(deleted.data);
  const merged=new Map<string,Vehicle&{_etag:string|null}>(
    (seedVehicles as Vehicle[])
      .filter(v=>!deletedSet.has(v.id))
      .map(v=>[v.id,{...v,_etag:null}])
  );
  saved.forEach(v=>{if(!deletedSet.has(v.id))merged.set(v.id,v);});
  return [...merged.values()];
}
export async function deleteVehicle(id:string) {
  const key=`vehicles/${id}.json`;
  const copies=await bucket().list({prefix:`backups/${key}/`});
  if(copies.objects.length)await bucket().delete(copies.objects.map(o=>o.key));
  await bucket().delete(key);
  if((seedVehicles as Vehicle[]).some(v=>v.id===id)){
    const deleted=await readDoc<string[]>("private/deleted-vehicles.json",[]);
    if(!deleted.data.includes(id)){
      await bucket().put("private/deleted-vehicles.json",JSON.stringify([...deleted.data,id]),{httpMetadata:{contentType:"application/json"}});
    }
  }
}
export async function metrics() {
  return (await readDoc<VehicleMetrics>("private/metrics.json",{})).data;
}
export async function recordMetric(vehicleId:string,event:"view"|"whatsapp") {
  const current=await readDoc<VehicleMetrics>("private/metrics.json",{});
  const prev=current.data[vehicleId]||{views:0,whatsappClicks:0,updatedAt:new Date().toISOString()};
  const next:VehicleMetrics={
    ...current.data,
    [vehicleId]:{
      views:prev.views+(event==="view"?1:0),
      whatsappClicks:prev.whatsappClicks+(event==="whatsapp"?1:0),
      updatedAt:new Date().toISOString()
    }
  };
  await bucket().put("private/metrics.json",JSON.stringify(next),{httpMetadata:{contentType:"application/json"}});
  return next[vehicleId];
}
export async function settings() {return readDoc<Settings>("settings.json",seedSettings as Settings);}
export async function administrator() {return readDoc<{userId:string;email:string}|null>("private/admin.json",null);}
