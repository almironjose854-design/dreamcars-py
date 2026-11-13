import {z} from "zod";
const text=(n=300)=>z.string().trim().max(n);
const safeUrl=z.string().max(2000).refine(v=>v===""||/^\/(api\/)?media\/[a-zA-Z0-9._-]+$/.test(v)||/^https:\/\//.test(v),"Usá una URL HTTPS válida.");
export const vehicleSchema=z.object({
  id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),brand:text(60).min(1),model:text(100).min(1),version:text(100),
  year:z.number().int().min(1900).max(2100).nullable(),mileage:z.number().int().min(0).max(5000000).nullable(),
  transmission:text(60),fuel:text(60),engine:text(100),body:text(60),drive:text(60),color:text(60),
  price:z.number().min(0).max(1000000000000).nullable(),currency:z.enum(["USD","PYG"]),description:text(6000),
  features:z.array(text(120)).max(40),images:z.array(z.object({url:safeUrl,publicId:text(250).optional()})).max(20),
  status:z.enum(["published","draft","archived"]),availability:z.enum(["consult","available","reserved","sold"]),
  featured:z.boolean(),sourceUrl:z.string().max(2000).refine(v=>v===""||/^https:\/\//.test(v),"Usá un enlace HTTPS válido."),updatedAt:z.string()
}).refine(v=>v.status!=="published"||v.images.length>0,"Agregá al menos una foto antes de publicar.");
export const settingsSchema=z.object({name:text(100).min(1),tagline:text(200),address:text(200),city:text(100),
  whatsapp:z.string().regex(/^[0-9]{8,16}$/),instagram:z.string().regex(/^https:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?$/),
  email:z.union([z.literal(""),z.string().email()]),hours:text(300),about:text(4000),logo:safeUrl,heroImage:safeUrl,
  exchangeRate:z.coerce.number().int().min(100).max(1000000).optional()});
export const inquirySchema=z.object({name:text(100).min(2),phone:text(40).regex(/^\+?[0-9\s()-]{7,30}$/),message:text(2000).min(10),
  vehicleId:text(80).default(""),type:z.enum(["vehicle","consignment","general","import"]),consent:z.literal(true),notes:text(2000).optional(),website:z.string().max(0).optional()});
