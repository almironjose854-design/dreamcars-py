import type {Metadata} from "next";
import VehicleDetail from "../../vehicle-detail";
import {settings,vehicles} from "../../../lib/store";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
  const {id}=await params;
  const v=(await vehicles()).find(v=>v.id===id&&v.status==="published");
  const title=v?`${v.brand} ${v.model} ${v.version?`(${v.version}) `:""}— Dream Cars PY`:"Vehículo — Dream Cars PY";
  const description=v?.description||"Conocé este vehículo en Dream Cars PY y consultá todos sus detalles.";
  const cover=v?.images[0]?.url;
  return {
    title,
    description,
    openGraph:{
      title,
      description,
      type:"website",
      locale:"es_PY",
      siteName:"Dream Cars PY",
      ...(cover?{images:[{url:cover,alt:`${v.brand} ${v.model} en Dream Cars PY`}]}:{})
    },
    twitter:{
      card:"summary_large_image",
      title,
      description,
      ...(cover?{images:[cover]}:{})
    }
  };
}

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const [config,inventory]=await Promise.all([settings(),vehicles()]);
  const published=inventory.filter(v=>v.status==="published").map(({_etag,...v})=>v);
  const current=published.find(v=>v.id===id)||null;
  const related=current
    ?published
        .filter(v=>v.id!==current.id)
        .sort((a,b)=>{
          const scoreA=(a.brand===current.brand?2:0)+(a.body===current.body?1:0)+(a.featured?0.5:0);
          const scoreB=(b.brand===current.brand?2:0)+(b.body===current.body?1:0)+(b.featured?0.5:0);
          return scoreB-scoreA;
        })
        .slice(0,3)
    :published.slice(0,3);

  return (
    <VehicleDetail
      id={id}
      initialSettings={config.data}
      initialVehicle={current}
      initialRelated={related}
    />
  );
}
