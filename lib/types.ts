export type Vehicle = {
  id: string; brand: string; model: string; version: string; year: number | null;
  mileage: number | null; transmission: string; fuel: string; engine: string;
  body: string; drive: string; color: string; price: number | null; currency: "USD" | "PYG";
  description: string; features: string[]; images: {url:string; publicId?:string}[];
  status: "published" | "draft" | "archived"; availability: "consult" | "available" | "reserved" | "sold";
  featured: boolean; sourceUrl: string; updatedAt: string;
};
export type Settings = {
  name:string; tagline:string; address:string; city:string; whatsapp:string;
  instagram:string; email:string; hours:string; about:string;
  logo:string; heroImage:string;
};
export type Inquiry = {id:string;name:string;phone:string;message:string;vehicleId:string;type:string;consent:boolean;status:"new"|"contacted"|"closed";createdAt:string};
