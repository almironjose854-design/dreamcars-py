export type Vehicle = {
  id: string; brand: string; model: string; version: string; year: number | null;
  mileage: number | null; transmission: string; fuel: string; engine: string;
  body: string; drive: string; color: string; price: number | null; currency: "USD" | "PYG";
  description: string; features: string[]; images: {url:string; publicId?:string}[];
  status: "published" | "draft" | "archived"; availability: "consult" | "available" | "reserved" | "sold";
  featured: boolean; sourceUrl: string; videoUrl?: string; updatedAt: string;
};
export type Settings = {
  name:string; tagline:string; address:string; city:string; whatsapp:string;
  instagram:string; email:string; hours:string; about:string;
  logo:string; heroImage:string; exchangeRate?:number;
  telegramBotToken?:string; telegramChatId?:string; webhookUrl?:string;
};
export type Inquiry = {
  id: string;
  name: string;
  phone: string;
  message: string;
  vehicleId: string;
  type: "vehicle" | "consignment" | "general" | "import" | string;
  consent: boolean;
  status: "new" | "contacted" | "closed";
  notes?: string;
  createdAt: string;
};
export type VehicleMetrics = Record<string, { views: number; whatsappClicks: number; updatedAt: string }>;
export type AuditAction =
  | "vehicle.create"
  | "vehicle.update"
  | "vehicle.delete"
  | "inquiry.update"
  | "inquiry.delete"
  | "settings.update"
  | "backup.restore"
  | "cloudinary.update"
  | "account.update"
  | "recovery.used";
export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  targetId: string;
  summary: string;
};
export type AdminSessionInfo = {
  isAdmin:boolean;
  user:{username:string;displayName:string}|null;
  mustChangePassword:boolean;
  csrfToken:string|null;
  expiresAt:number|null;
  recoveryCodesCount?:number;
};
