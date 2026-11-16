import seedVehicles from "../data/vehicles.json";
import seedSettings from "../data/settings.json";
import type { AuditAction, AuditEntry, Inquiry, Settings, Vehicle, VehicleMetrics } from "./types";
import { configuredObjectStore } from "./object-store";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function bucket() {
  const store = configuredObjectStore();
  if (!store) throw new ApiError(503, "El almacenamiento persistente no está disponible.");
  return store;
}

const keyLocks = new Map<string, Promise<unknown>>();
async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = keyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const chained = prev.then(() => gate, () => gate);
  keyLocks.set(key, chained);
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (keyLocks.get(key) === chained) keyLocks.delete(key);
  }
}

export async function readDoc<T>(key: string, fallback: T): Promise<{ data: T; etag: string | null }> {
  const file = await bucket().get(key);
  return file ? { data: await file.json<T>(), etag: file.etag } : { data: fallback, etag: null };
}

export async function atomicUpdate<T>(key: string, fallback: T, update: (current: T) => T, retries = 8): Promise<T> {
  return withKeyLock(key, async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      const current = await readDoc<T>(key, fallback);
      const next = update(current.data);
      const result = await bucket().put(key, JSON.stringify(next), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        onlyIf: current.etag ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" }
      });
      if (result) return next;
    }
    throw new ApiError(409, "Hubo varios cambios al mismo tiempo. Volvé a intentar.");
  });
}

async function deletePrefix(prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await bucket().list({ prefix, cursor });
    if (page.objects.length) await bucket().delete(page.objects.map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function writeDoc(key: string, value: unknown, etag: string | null, backup = true) {
  return withKeyLock(key, async () => {
    const current = await bucket().get(key);
    if ((current?.etag ?? null) !== etag) {
      throw new ApiError(409, "Este registro cambió. Actualizá la página antes de guardar.");
    }
    if (current && backup) {
      const backupPrefix = `backups/${key}/`;
      await bucket().put(
        `${backupPrefix}${Date.now()}-${crypto.randomUUID()}.json`,
        await current.text(),
        { httpMetadata: { contentType: "application/json" } }
      );
      const existing = await bucket().list({ prefix: backupPrefix });
      if (existing.objects.length > 10) {
        const sorted = [...existing.objects].sort((a, b) => a.key.localeCompare(b.key));
        const toDelete = sorted.slice(0, sorted.length - 10).map(o => o.key);
        if (toDelete.length) await bucket().delete(toDelete);
      }
    }
    const result = await bucket().put(key, JSON.stringify(value, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }
    });
    if (!result) {
      throw new ApiError(409, "Otro administrador guardó cambios. Actualizá y volvé a intentarlo.");
    }
    if (key.startsWith("vehicles/")) {
      const vid = key.slice("vehicles/".length).replace(/\.json$/, "");
      const deleted = await readDoc<string[]>("private/deleted-vehicles.json", []);
      if (deleted.data.includes(vid)) {
        await atomicUpdate<string[]>("private/deleted-vehicles.json", [], items => items.filter(x => x !== vid));
      }
    }
    return result.etag;
  });
}

export async function listDocs<T>(prefix: string) {
  let cursor: string | undefined;
  const keys: string[] = [];
  do {
    const page = await bucket().list({ prefix, cursor });
    keys.push(...page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const result: (T & { _etag: string })[] = [];
  for (let i = 0; i < keys.length; i += 30) {
    const batch = await Promise.all(
      keys.slice(i, i + 30).map(async key => {
        const file = await bucket().get(key);
        return file ? { ...(await file.json<T>()), _etag: file.etag } : null;
      })
    );
    for (const v of batch) if (v) result.push(v as T & { _etag: string });
  }
  return result;
}

export async function vehicles() {
  const [saved, deleted] = await Promise.all([
    listDocs<Vehicle>("vehicles/"),
    readDoc<string[]>("private/deleted-vehicles.json", [])
  ]);
  const deletedSet = new Set(deleted.data);
  const seedMap = new Map<string, Vehicle>((seedVehicles as Vehicle[]).map(v => [v.id, v]));
  const merged = new Map<string, Vehicle & { _etag: string | null }>(
    (seedVehicles as Vehicle[])
      .filter(v => !deletedSet.has(v.id))
      .map(v => [v.id, { ...v, _etag: null }])
  );
  saved.forEach(v => {
    if (deletedSet.has(v.id)) return;
    const seed = seedMap.get(v.id);
    if (seed && v.engine === "A confirmar" && v.images.length <= 1 && v.features.length === 0) {
      merged.set(v.id, {
        ...v,
        year: v.year ?? seed.year,
        transmission: seed.transmission,
        fuel: seed.fuel,
        engine: seed.engine,
        drive: seed.drive,
        description: seed.description,
        features: seed.features,
        images: seed.images,
        videoUrl: v.videoUrl || seed.videoUrl
      });
    } else {
      merged.set(v.id, v);
    }
  });
  return [...merged.values()];
}

export async function deleteVehicle(id: string) {
  const key = `vehicles/${id}.json`;
  const current = (await vehicles()).find(vehicle => vehicle.id === id);
  await deletePrefix(`backups/${key}/`);
  await bucket().delete(key);
  if ((seedVehicles as Vehicle[]).some(v => v.id === id)) {
    await atomicUpdate<string[]>("private/deleted-vehicles.json", [], items =>
      items.includes(id) ? items : [...items, id]
    );
  }
  if (current) await deleteUnusedLocalUploads(current.images.map(image => image.url));
}

export async function deleteUnusedLocalUploads(urls: string[]) {
  const names = [
    ...new Set(
      urls.flatMap(url => {
        const match = url.match(/^\/api\/media\/([a-zA-Z0-9._-]{1,100})$/);
        return match ? [match[1]] : [];
      })
    )
  ];
  if (!names.length) return;
  const [allVehicles, currentSettings] = await Promise.all([vehicles(), settings()]);
  const referenced = new Set<string>([
    ...allVehicles.flatMap(vehicle => vehicle.images.map(image => image.url)),
    currentSettings.data.logo,
    currentSettings.data.heroImage
  ]);
  const unused = names.filter(name => !referenced.has(`/api/media/${name}`));
  if (unused.length) await bucket().delete(unused.map(name => `uploads/${name}`));
}

export async function metrics() {
  return (await readDoc<VehicleMetrics>("private/metrics.json", {})).data;
}

export async function recordMetric(vehicleId: string, event: "view" | "whatsapp") {
  const next = await atomicUpdate<VehicleMetrics>("private/metrics.json", {}, current => {
    const prev = current[vehicleId] || { views: 0, whatsappClicks: 0, updatedAt: new Date().toISOString() };
    return {
      ...current,
      [vehicleId]: {
        views: prev.views + (event === "view" ? 1 : 0),
        whatsappClicks: prev.whatsappClicks + (event === "whatsapp" ? 1 : 0),
        updatedAt: new Date().toISOString()
      }
    };
  });
  return next[vehicleId];
}

export async function auditLog() {
  return (await readDoc<AuditEntry[]>("private/audit-log.json", [])).data;
}

export async function recordAudit(actor: string, action: AuditAction, targetId: string, summary: string) {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    targetId,
    summary
  };
  await atomicUpdate<AuditEntry[]>("private/audit-log.json", [], current => [entry, ...current].slice(0, 150));
  return entry;
}

export async function atomicRestoreBackup(payload: {
  settings: Settings;
  vehicles: Vehicle[];
  inquiries: Inquiry[];
}) {
  const [oldSettings, prevVehicles, prevInquiries] = await Promise.all([
    settings(),
    listDocs<Vehicle>("vehicles/"),
    listDocs<Inquiry>("inquiries/")
  ]);

  const snapshotPrefix = "backups/pre-restore/";
  const snapshotKey = `${snapshotPrefix}${Date.now()}-${crypto.randomUUID()}.json`;
  const snapshotData = {
    createdAt: new Date().toISOString(),
    settings: oldSettings.data,
    vehicles: prevVehicles,
    inquiries: prevInquiries
  };
  await bucket().put(snapshotKey, JSON.stringify(snapshotData), {
    httpMetadata: { contentType: "application/json" }
  });
  const snapshots = await bucket().list({ prefix: snapshotPrefix });
  if (snapshots.objects.length > 5) {
    const sorted = [...snapshots.objects].sort((a, b) => a.key.localeCompare(b.key));
    const toRemove = sorted.slice(0, sorted.length - 5).map(o => o.key);
    if (toRemove.length) await bucket().delete(toRemove);
  }

  const writtenVehicleKeys: { key: string; prev: Vehicle | null }[] = [];
  const writtenInquiryKeys: { key: string; prev: Inquiry | null }[] = [];
  let settingsUpdated = false;

  try {
    await writeDoc("settings.json", payload.settings, oldSettings.etag);
    settingsUpdated = true;

    for (const v of payload.vehicles) {
      const key = `vehicles/${v.id}.json`;
      const old = await readDoc<Vehicle | null>(key, null);
      await writeDoc(key, v, old.etag);
      writtenVehicleKeys.push({ key, prev: old.data });
    }
    for (const q of payload.inquiries) {
      const key = `inquiries/${q.id}.json`;
      const old = await readDoc<Inquiry | null>(key, null);
      await writeDoc(key, q, old.etag);
      writtenInquiryKeys.push({ key, prev: old.data });
    }
  } catch (err) {
    // Rollback any partial changes so restore is atomic
    if (settingsUpdated) {
      const cur = await readDoc<Settings | null>("settings.json", null);
      await bucket().put("settings.json", JSON.stringify(oldSettings.data, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        ...(cur.etag ? { onlyIf: { etagMatches: cur.etag } } : {})
      });
    }
    for (const item of writtenVehicleKeys) {
      if (item.prev) {
        await bucket().put(item.key, JSON.stringify(item.prev, null, 2), {
          httpMetadata: { contentType: "application/json; charset=utf-8" }
        });
      } else {
        await bucket().delete(item.key);
      }
    }
    for (const item of writtenInquiryKeys) {
      if (item.prev) {
        await bucket().put(item.key, JSON.stringify(item.prev, null, 2), {
          httpMetadata: { contentType: "application/json; charset=utf-8" }
        });
      } else {
        await bucket().delete(item.key);
      }
    }
    throw err;
  }
}

export async function settings() {
  return readDoc<Settings>("settings.json", seedSettings as Settings);
}

export function publicSettings(s: Settings): Settings {
  const clean = { ...s };
  delete clean.telegramBotToken;
  delete clean.telegramChatId;
  delete clean.webhookUrl;
  return clean;
}
