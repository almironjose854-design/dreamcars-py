import type { AuditEntry, Inquiry, Settings, Vehicle, VehicleMetrics } from "../../lib/types";

export type Stored<T> = T & { _etag: string | null };

export type AdminData = {
  vehicles: Stored<Vehicle>[];
  settings: Stored<Settings>;
  inquiries: Stored<Inquiry>[];
  metrics?: VehicleMetrics;
  auditLog?: AuditEntry[];
  storage: { mode: "s3" | "upstash" | "r2-binding" | "unavailable"; durable: boolean };
  cloudinary: { configured: boolean; cloudName: string };
};

export type BackupPayload = {
  schemaVersion: 1;
  exportedAt?: string;
  settings: Settings;
  vehicles: Vehicle[];
  inquiries: Inquiry[];
};
