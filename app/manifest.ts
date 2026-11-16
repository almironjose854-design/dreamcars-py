import type {MetadataRoute} from "next";

export default function manifest():MetadataRoute.Manifest{
  return {
    name:"Dream Cars PY",
    short_name:"Dream Cars",
    description:"Catálogo de vehículos con carácter en Luque, Paraguay.",
    start_url:"/",
    display:"standalone",
    background_color:"#111111",
    theme_color:"#111111",
    icons:[{src:"/favicon.svg",sizes:"any",type:"image/svg+xml"}]
  };
}
