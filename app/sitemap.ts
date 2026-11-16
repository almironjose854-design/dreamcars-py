import type {MetadataRoute} from "next";
import {vehicles} from "../lib/store";
import {SITE_URL} from "../lib/site-url";

export const dynamic="force-dynamic";

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const catalog=(await vehicles()).filter(vehicle=>vehicle.status==="published");
  return [
    {url:SITE_URL,lastModified:new Date(),changeFrequency:"daily",priority:1},
    {url:`${SITE_URL}/privacidad`,changeFrequency:"yearly",priority:.2},
    {url:`${SITE_URL}/terminos`,changeFrequency:"yearly",priority:.2},
    ...catalog.map(vehicle=>({
      url:`${SITE_URL}/vehiculos/${vehicle.id}`,
      lastModified:new Date(vehicle.updatedAt),
      changeFrequency:"weekly" as const,
      priority:.8
    }))
  ];
}
