import {
  ApiError,
  atomicRestoreBackup,
  auditLog,
  bucket,
  deleteUnusedLocalUploads,
  deleteVehicle,
  listDocs,
  metrics,
  readDoc,
  recordAudit,
  settings,
  vehicles,
  writeDoc
} from "../store";
import { credentials, saveCredentials, signature, verifyCredentials } from "../cloudinary";
import { sendInquiryNotification } from "../notifications";
import { storageMode } from "../object-store";
import { inquirySchema, settingsSchema, vehicleSchema } from "../validation";
import type { Inquiry, Settings, Vehicle } from "../types";
import { body, json, rate, stripEtag } from "./http";

export async function getAdminData() {
  const [config, cloud, allVehicles, allInquiries, allMetrics, logs] = await Promise.all([
    settings(),
    credentials(),
    vehicles(),
    listDocs<Inquiry>("inquiries/"),
    metrics(),
    auditLog()
  ]);
  const mode = storageMode();
  return json({
    vehicles: allVehicles,
    settings: { ...config.data, _etag: config.etag },
    inquiries: allInquiries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    metrics: allMetrics,
    auditLog: logs,
    storage: { mode, durable: mode === "s3" || mode === "upstash" || mode === "r2-binding" },
    cloudinary: { configured: !!cloud, cloudName: cloud?.cloudName ?? "" }
  });
}

export async function postTestNotification(req: Request) {
  rate(req, 10);
  const input = await body(req);
  const stored = await settings();
  const merged: Settings = {
    ...stored.data,
    ...(typeof input.telegramBotToken === "string" ? { telegramBotToken: input.telegramBotToken } : {}),
    ...(typeof input.telegramChatId === "string" ? { telegramChatId: input.telegramChatId } : {}),
    ...(typeof input.webhookUrl === "string" ? { webhookUrl: input.webhookUrl } : {})
  };
  if (!merged.telegramBotToken?.trim() && !merged.webhookUrl?.trim()) {
    throw new ApiError(400, "Configurá primero un Bot Token + Chat ID de Telegram o una URL de Webhook.");
  }
  const sampleInquiry: Inquiry = {
    id: crypto.randomUUID(),
    name: "Cliente de Prueba (Dream Cars PY)",
    phone: merged.whatsapp || "595981304731",
    message: "Esta es una alerta de prueba enviada desde el panel administrativo de Dream Cars PY.",
    vehicleId: "honda-s2000",
    type: "vehicle",
    consent: true,
    status: "new",
    createdAt: new Date().toISOString()
  };
  const res = await sendInquiryNotification(sampleInquiry, merged, "Honda S2000 (VTEC AP1)");
  if (res.errors.length > 0 && !res.sentTelegram && !res.sentWebhook) {
    throw new ApiError(422, `No se pudo entregar la notificación: ${res.errors.join(" · ")}`);
  }
  return json({
    ok: true,
    sentTelegram: res.sentTelegram,
    sentWebhook: res.sentWebhook,
    errors: res.errors
  });
}

export async function postUploadLocal(req: Request) {
  rate(req, 60);
  const input = await body(req);
  if (typeof input.dataUrl !== "string") throw new ApiError(400, "Imagen inválida.");
  const matchData = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp|avif|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!matchData) throw new ApiError(400, "Formato de imagen no admitido.");
  const mime = matchData[1];
  const ext =
    mime === "image/webp"
      ? "webp"
      : mime === "image/png"
        ? "png"
        : mime === "image/avif"
          ? "avif"
          : mime === "image/gif"
            ? "gif"
            : "jpg";
  const binaryStr = atob(matchData[2]);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  if (bytes.byteLength > 5 * 1024 * 1024) {
    throw new ApiError(413, "La imagen optimizada supera los 5 MB.");
  }
  const fileId = `${crypto.randomUUID()}.${ext}`;
  await bucket().put(`uploads/${fileId}`, bytes, { httpMetadata: { contentType: mime } });
  return json({ url: `/api/media/${fileId}`, publicId: `local-${fileId}` });
}

export async function putVehicle(req: Request, vehicleId: string, actor: string) {
  const input = await body(req);
  const parsedVehicle = vehicleSchema.safeParse({ ...input, id: vehicleId, updatedAt: new Date().toISOString() });
  if (!parsedVehicle.success) {
    throw new ApiError(400, "Revisá los campos del formulario.");
  }
  const item = parsedVehicle.data;
  const old = await readDoc<Vehicle | null>(`vehicles/${vehicleId}.json`, null);
  if (old.etag !== (input._etag ?? null)) {
    throw new ApiError(409, "La ficha cambió. Actualizá antes de guardar.");
  }
  const cloud = await credentials();
  const currentVehicles = await vehicles();
  const existingImageUrls = new Set(currentVehicles.flatMap(v => v.images.map(i => i.url)));
  for (const img of item.images) {
    if (img.url.startsWith("/api/media/")) {
      const fname = img.url.slice("/api/media/".length);
      if (!(await bucket().head(`uploads/${fname}`))) {
        throw new ApiError(400, "La foto subida no existe en el servidor.");
      }
    } else if (img.url.startsWith("/media/") || existingImageUrls.has(img.url)) {
      continue;
    } else if (!cloud || !img.url.startsWith(`https://res.cloudinary.com/${cloud.cloudName}/image/upload/`)) {
      throw new ApiError(400, "Las fotos deben subirse al servidor o pertenecer a tu cuenta de Cloudinary.");
    }
  }
  const previous = currentVehicles.find(vehicle => vehicle.id === vehicleId);
  const removedUrls = (previous?.images || [])
    .map(image => image.url)
    .filter(url => !item.images.some(image => image.url === url));
  const etag = await writeDoc(`vehicles/${vehicleId}.json`, item, old.etag);
  await deleteUnusedLocalUploads(removedUrls);
  const isCreate = !previous;
  await recordAudit(
    actor,
    isCreate ? "vehicle.create" : "vehicle.update",
    vehicleId,
    `${isCreate ? "Creó" : "Actualizó"} ${item.brand} ${item.model} (${item.status})`
  );
  return json({ ...item, _etag: etag });
}

export async function deleteVehicleHandler(req: Request, vehicleId: string, actor: string) {
  const input = await body(req);
  const old = await readDoc<Vehicle | null>(`vehicles/${vehicleId}.json`, null);
  if (old.etag && old.etag !== (input._etag ?? null)) {
    throw new ApiError(409, "La ficha cambió. Actualizá antes de eliminar.");
  }
  const existing = (await vehicles()).find(v => v.id === vehicleId);
  await deleteVehicle(vehicleId);
  await recordAudit(
    actor,
    "vehicle.delete",
    vehicleId,
    `Eliminó definitivamente ${existing ? `${existing.brand} ${existing.model}` : vehicleId}`
  );
  return json({ ok: true });
}

export async function putSettings(req: Request, actor: string) {
  const input = await body(req);
  const parsedSettings = settingsSchema.safeParse(input);
  if (!parsedSettings.success) {
    throw new ApiError(400, "Revisá los campos del formulario.");
  }
  const value = parsedSettings.data;
  const old = await settings();
  if (old.etag !== (input._etag ?? null)) {
    throw new ApiError(409, "Los datos del negocio cambiaron. Actualizá antes de guardar.");
  }
  const removedUrls = [old.data.logo, old.data.heroImage].filter(
    url => url && url !== value.logo && url !== value.heroImage
  );
  const etag = await writeDoc("settings.json", value, old.etag);
  if (removedUrls.length) await deleteUnusedLocalUploads(removedUrls);
  await recordAudit(actor, "settings.update", "settings.json", "Actualizó los datos generales del negocio");
  return json({ ...value, _etag: etag });
}

export async function deleteInquiryHandler(req: Request, inquiryId: string, actor: string) {
  const input = await body(req);
  const key = `inquiries/${inquiryId}.json`;
  const old = await readDoc<Inquiry | null>(key, null);
  if (!old.data) throw new ApiError(404, "Consulta no encontrada.");
  if (old.etag !== (input._etag ?? null)) {
    throw new ApiError(409, "La consulta cambió. Actualizá antes de eliminar.");
  }
  const copies = await bucket().list({ prefix: `backups/${key}/` });
  let cursor: string | undefined = copies.truncated ? copies.cursor : undefined;
  if (copies.objects.length) await bucket().delete(copies.objects.map(o => o.key));
  while (cursor) {
    const page = await bucket().list({ prefix: `backups/${key}/`, cursor });
    if (page.objects.length) await bucket().delete(page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  }
  await bucket().delete(key);
  await recordAudit(actor, "inquiry.delete", inquiryId, `Eliminó la consulta de ${old.data.name}`);
  return json({ ok: true });
}

export async function patchInquiryHandler(req: Request, inquiryId: string, actor: string) {
  const input = await body(req);
  const old = await readDoc<Inquiry | null>(`inquiries/${inquiryId}.json`, null);
  if (!old.data) throw new ApiError(404, "Consulta no encontrada.");
  if (old.etag !== (input._etag ?? null)) {
    throw new ApiError(409, "La consulta cambió. Actualizá antes de guardar.");
  }
  const nextStatus = input.status !== undefined ? String(input.status) : old.data.status;
  if (!["new", "contacted", "closed"].includes(nextStatus)) {
    throw new ApiError(400, "Estado inválido.");
  }
  const nextNotes = input.notes !== undefined ? String(input.notes).trim().slice(0, 2000) : old.data.notes;
  const updated: Inquiry = {
    ...old.data,
    status: nextStatus as Inquiry["status"],
    ...(nextNotes !== undefined ? { notes: nextNotes } : {})
  };
  const etag = await writeDoc(`inquiries/${inquiryId}.json`, updated, old.etag);
  const statusLabels: Record<string, string> = { new: "Nueva", contacted: "Contactada", closed: "Cerrada" };
  await recordAudit(
    actor,
    "inquiry.update",
    inquiryId,
    input.notes !== undefined && input.status === undefined
      ? `Actualizó nota interna en la consulta de ${old.data.name}`
      : `Marcó la consulta de ${old.data.name} como ${statusLabels[nextStatus] || nextStatus}`
  );
  return json({ ...updated, _etag: etag });
}

export async function postCloudinary(req: Request, actor: string) {
  rate(req, 10);
  const input = await body(req);
  const cloudName = typeof input.cloudName === "string" ? input.cloudName : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey : "";
  const apiSecret = typeof input.apiSecret === "string" ? input.apiSecret : "";
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(cloudName) ||
    !/^\d{5,30}$/.test(apiKey) ||
    apiSecret.length < 10 ||
    apiSecret.length > 200
  ) {
    throw new ApiError(400, "Revisá los datos de Cloudinary.");
  }
  await verifyCredentials({ cloudName, apiKey, apiSecret });
  await saveCredentials({ cloudName, apiKey, apiSecret });
  await recordAudit(actor, "cloudinary.update", cloudName, `Conectó cuenta Cloudinary (${cloudName})`);
  return json({ ok: true, cloudName });
}

export async function postUploadSignature(req: Request) {
  rate(req, 100);
  const cloud = await credentials();
  if (!cloud) throw new ApiError(422, "Conectá Cloudinary en Integraciones antes de subir fotos.");
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    folder: "dreamcars/vehicles",
    public_id: crypto.randomUUID(),
    overwrite: "false"
  };
  return json({
    params,
    signature: await signature(params, cloud.apiSecret),
    cloudName: cloud.cloudName,
    apiKey: cloud.apiKey
  });
}

export async function getBackup() {
  const clean = <T extends { _etag?: unknown }>(list: T[]) => list.map(stripEtag);
  const output = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: (await settings()).data,
    vehicles: clean(await vehicles()),
    inquiries: clean(await listDocs<Inquiry>("inquiries/"))
  };
  return new Response(JSON.stringify(output, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dreamcars-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store"
    }
  });
}

export async function postRestore(req: Request, actor: string) {
  const input = await body(req);
  if (
    input.schemaVersion !== 1 ||
    !Array.isArray(input.vehicles) ||
    input.vehicles.length > 500 ||
    !Array.isArray(input.inquiries) ||
    input.inquiries.length > 2000
  ) {
    throw new ApiError(400, "El respaldo no tiene el formato esperado.");
  }
  const newSettings = settingsSchema.parse(input.settings);
  const newVehicles = input.vehicles.map((v: unknown) => vehicleSchema.parse(v));
  if (new Set(newVehicles.map((v: Vehicle) => v.id)).size !== newVehicles.length) {
    throw new ApiError(400, "Hay identificadores de vehículos repetidos.");
  }
  const newInquiries = input.inquiries.map((rawQ: unknown) => {
    const q = rawQ as Inquiry;
    if (
      !q ||
      !/^[a-f0-9-]{36}$/.test(q.id) ||
      !["new", "contacted", "closed"].includes(q.status) ||
      !Number.isFinite(Date.parse(q.createdAt))
    ) {
      throw new ApiError(400, "El respaldo contiene una consulta inválida.");
    }
    const parsed = inquirySchema.parse({ ...q, website: undefined });
    delete parsed.website;
    return {
      ...parsed,
      id: q.id,
      status: q.status,
      ...(q.notes ? { notes: String(q.notes).slice(0, 2000) } : {}),
      createdAt: q.createdAt
    };
  });

  await atomicRestoreBackup({
    settings: newSettings,
    vehicles: newVehicles,
    inquiries: newInquiries
  });
  await recordAudit(
    actor,
    "backup.restore",
    "backup",
    `Importó respaldo (${newVehicles.length} vehículos, ${newInquiries.length} consultas)`
  );
  return json({
    ok: true,
    message: "Respaldo combinado de forma atómica. Se conservaron los registros que no estaban en el archivo."
  });
}
