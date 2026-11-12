import Showroom from "./showroom";
import {settings,vehicles} from "../lib/store";
export const dynamic="force-dynamic";
export default async function Home() {
  const [config,inventory]=await Promise.all([settings(),vehicles()]);
  return <Showroom initialCatalog={{settings:config.data,vehicles:inventory.filter(v=>v.status==="published").map(({_etag,...v})=>v)}}/>;
}
