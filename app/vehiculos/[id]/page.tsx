import VehicleDetail from "../../vehicle-detail";
import seed from "../../../data/vehicles.json";
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;const v=seed.find(v=>v.id===id);return {title:v?`${v.brand} ${v.model} — Dream Cars PY`:"Vehículo — Dream Cars PY",description:v?.description||"Conocé este vehículo en Dream Cars PY y consultá todos sus detalles."};}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <VehicleDetail id={id}/>;}
