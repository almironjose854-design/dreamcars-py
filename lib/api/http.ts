import { ApiError, bucket } from "../store";

export const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });

export function authResponse(result: unknown, cookie: string) {
  return Response.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": cookie,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function stripEtag<T extends { _etag?: unknown }>(item: T): Omit<T, "_etag"> {
  const copy = { ...item };
  delete copy._etag;
  return copy;
}

const attempts = new Map<string, { count: number; expires: number }>();

export function clientIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local-preview"
  );
}

export function rate(request: Request, limit: number) {
  const key = clientIp(request) + new URL(request.url).pathname;
  const now = Date.now();
  if (attempts.size > 2000) {
    for (const [k, v] of attempts) if (v.expires < now) attempts.delete(k);
  }
  const a = attempts.get(key);
  if (a && a.expires > now) {
    if (a.count >= limit) {
      throw new ApiError(429, "Demasiados intentos. Volvé a intentar en unos minutos.");
    }
    a.count++;
  } else {
    attempts.set(key, { count: 1, expires: now + 600000 });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "Enviá datos JSON.");
  }
  if (Number(req.headers.get("content-length")) > 6000000) {
    throw new ApiError(413, "El archivo supera el límite permitido.");
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Faltan los datos JSON.");
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 6000000) {
      await reader.cancel();
      throw new ApiError(413, "El archivo supera el límite permitido.");
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "El JSON no es válido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(400, "Enviá un objeto JSON válido.");
  }
  return parsed as Record<string, unknown>;
}

export async function inquiryLimit(req: Request) {
  const ip = clientIp(req);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const window = Math.floor(Date.now() / 600000);
  const prefix = `private/limits/${hash}/`;
  const old = await bucket().list({ prefix });
  const expired = old.objects
    .filter(o => Number(o.key.slice(prefix.length).split("-")[0]) < window)
    .map(o => o.key);
  if (expired.length) await bucket().delete(expired);
  for (let i = 0; i < 5; i++) {
    const key = `${prefix}${window}-${i}.json`;
    if (await bucket().head(key)) continue;
    const reserved = await bucket().put(key, JSON.stringify({ expiresAt: (window + 1) * 600000 }), {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" }
    });
    if (reserved) return;
  }
  throw new ApiError(429, "Ya recibimos varias consultas tuyas. Esperá unos minutos o escribinos por WhatsApp.");
}

export function origin(req: Request) {
  const o = req.headers.get("origin");
  if (!o) throw new ApiError(403, "Origen no permitido.");
  const reqUrl = new URL(req.url);
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host")?.trim();
  const expectedOrigins = new Set([reqUrl.origin]);
  if (fwdHost) {
    expectedOrigins.add(`${fwdProto || reqUrl.protocol.replace(":", "")}://${fwdHost}`);
    expectedOrigins.add(`https://${fwdHost}`);
  }
  if (!expectedOrigins.has(o)) throw new ApiError(403, "Origen no permitido.");
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Solicitud no permitida.");
  }
}
