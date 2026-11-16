import { ApiError, bucket, publicSettings, recordMetric, settings, vehicles, writeDoc } from "../store";
import { storageMode } from "../object-store";
import { sendInquiryNotification } from "../notifications";
import { inquirySchema } from "../validation";
import type { Inquiry } from "../types";
import { body, inquiryLimit, json, rate, stripEtag } from "./http";

export async function getCatalog() {
  const [config, inventory] = await Promise.all([settings(), vehicles()]);
  return json({
    settings: publicSettings(config.data),
    vehicles: inventory.filter(v => v.status === "published").map(stripEtag)
  });
}

export async function getHealth() {
  const mode = storageMode();
  await bucket().head("settings.json");
  return json({ ok: true, storage: mode, checkedAt: new Date().toISOString() });
}

export async function getMedia(fileId: string) {
  const obj = await bucket().get(`uploads/${fileId}`);
  if (!obj) throw new ApiError(404, "Imagen no encontrada.");
  return new Response(await obj.arrayBuffer(), {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function postMetric(req: Request) {
  rate(req, 60);
  const input = await body(req);
  const vehicleId = typeof input.vehicleId === "string" ? input.vehicleId.trim().slice(0, 80) : "";
  const event = input.event === "whatsapp" ? "whatsapp" : input.event === "view" ? "view" : null;
  if (!vehicleId || !event) throw new ApiError(400, "Datos de métrica inválidos.");
  if (!(await vehicles()).some(v => v.id === vehicleId)) {
    throw new ApiError(404, "Vehículo no encontrado.");
  }
  const updated = await recordMetric(vehicleId, event);
  return json({ ok: true, metrics: updated });
}

export async function postInquiry(req: Request) {
  rate(req, 5);
  const data = inquirySchema.parse(await body(req));
  await inquiryLimit(req);
  const allVehicles = await vehicles();
  const matchedVehicle = data.vehicleId
    ? allVehicles.find(v => v.id === data.vehicleId && v.status === "published")
    : undefined;
  if (data.vehicleId && !matchedVehicle) {
    throw new ApiError(400, "El vehículo ya no está publicado.");
  }
  const id = crypto.randomUUID();
  const clean = { ...data };
  delete clean.website;
  const record: Inquiry = {
    ...clean,
    id,
    status: "new",
    createdAt: new Date().toISOString()
  };
  await writeDoc(`inquiries/${id}.json`, record, null, false);
  const config = await settings();
  const vehicleLabel = matchedVehicle ? `${matchedVehicle.brand} ${matchedVehicle.model} (${matchedVehicle.version})` : undefined;
  sendInquiryNotification(record, config.data, vehicleLabel).catch(() => {});
  return json({ ok: true, id }, 201);
}
