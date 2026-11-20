const fallback="https://dreamcars-py.almironjose854.workers.dev";

export const SITE_URL=(()=>{
  const candidate=process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if(!candidate)return fallback;
  try{
    const url=new URL(candidate);
    return url.protocol==="https:"?url.origin:fallback;
  }catch{
    return fallback;
  }
})();
