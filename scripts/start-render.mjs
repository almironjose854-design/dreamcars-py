import { existsSync, copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { configureToolEnvironment } from "./tool-environment.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
configureToolEnvironment(projectRoot);
process.chdir(projectRoot);
for (const directory of [
  path.dirname(process.env.WRANGLER_LOG_PATH),
  process.env.WRANGLER_REGISTRY_PATH,
  process.env.MINIFLARE_REGISTRY_PATH,
]) {
  mkdirSync(directory, { recursive: true });
}

const crypto = globalThis.crypto ?? webcrypto;
const encoder = new TextEncoder();

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function formatDevVar(key, value) {
  const clean = String(value).replace(/[\r\n]+/g, "");
  if (!clean.includes("'")) return `${key}='${clean}'`;
  if (!clean.includes("`")) return `${key}=\`${clean}\``;
  return `${key}=${clean}`;
}

async function derivePasswordHash(password, salt, pepper) {
  const pepperKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prehash = await crypto.subtle.sign("HMAC", pepperKey, encoder.encode(password));
  const key = await crypto.subtle.importKey("raw", prehash, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 100_000 },
    key,
    256
  );
  return base64url(new Uint8Array(bits));
}

async function ensureDevVars() {
  const rootVars = path.join(projectRoot, ".dev.vars");
  const distServerDir = path.join(projectRoot, "dist/server");
  mkdirSync(distServerDir, { recursive: true });
  const distVars = path.join(distServerDir, ".dev.vars");

  if (!process.env.RENDER && existsSync(rootVars)) {
    copyFileSync(rootVars, distVars);
    return;
  }

  const authSecret = process.env.ADMIN_AUTH_SECRET || base64url(crypto.getRandomValues(new Uint8Array(32)));
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY || base64url(crypto.getRandomValues(new Uint8Array(32)));
  const s3Keys = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const hasS3 = s3Keys.every(key => Boolean(process.env[key]));
  const hasUpstash = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
      (process.env.DREAMCARS_CLOUD_KV_URL && process.env.DREAMCARS_CLOUD_KV_TOKEN)
  );
  if (process.env.DREAMCARS_REQUIRE_DURABLE_STORAGE === "true" && !hasS3 && !hasUpstash) {
    throw new Error(
      "Falta configurar almacenamiento persistente en la nube: definí UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (gratis en Upstash) o S3_ENDPOINT + S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY antes de iniciar en Render."
    );
  }
  if (!hasS3 && !hasUpstash) {
    console.warn(
      "[Dream Cars PY] Aviso: Usando almacenamiento local (.wrangler/state). Para persistencia permanente en Render Free ante reinicios, configurá UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN o S3_*."
    );
  }
  let bootstrapAccount = process.env.ADMIN_BOOTSTRAP_ACCOUNT;

  if (!bootstrapAccount) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || "dreamcarspy2026";
    const saltKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(authSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const saltBytes = await crypto.subtle.sign("HMAC", saltKey, encoder.encode("dreamcars-render-salt-v2"));
    const salt = base64url(new Uint8Array(saltBytes).slice(0, 18));
    const passwordHash = await derivePasswordHash(initialPassword, salt, authSecret);
    bootstrapAccount = JSON.stringify({
      username: (process.env.ADMIN_USERNAME || "admin").toLowerCase(),
      displayName: "Dream Cars PY",
      salt,
      passwordHash,
      version: "v2-render-bootstrap",
      mustChangePassword: process.env.ADMIN_MUST_CHANGE_PASSWORD === "true",
      updatedAt: new Date().toISOString(),
    });
  }
  bootstrapAccount = bootstrapAccount.replace(/'/g, "\\u0027");

  const lines = [
    formatDevVar("ADMIN_AUTH_SECRET", authSecret),
    formatDevVar("INTEGRATION_ENCRYPTION_KEY", encKey),
    formatDevVar("ADMIN_BOOTSTRAP_ACCOUNT", bootstrapAccount),
  ];

  for (const key of [
    "DREAMCARS_REQUIRE_DURABLE_STORAGE",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "DREAMCARS_CLOUD_KV_URL",
    "DREAMCARS_CLOUD_KV_TOKEN"
  ]) {
    if (process.env[key]) {
      lines.push(formatDevVar(key, process.env[key]));
    }
  }

  const content = lines.join("\n") + "\n";
  writeFileSync(rootVars, content, { mode: 0o600 });
  writeFileSync(distVars, content, { mode: 0o600 });
}

await ensureDevVars();

const port = String(process.env.PORT || "10000");
const host = process.env.HOST || "0.0.0.0";
const persistDir = process.env.PERSIST_DIR || ".wrangler/state";

const wranglerBin = path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const child = spawn(
  process.execPath,
  [
    wranglerBin,
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--persist-to",
    persistDir,
    "--ip",
    host,
    "--port",
    port,
    "--inspector-port",
    "0",
  ],
  { stdio: "inherit", cwd: projectRoot }
);

child.on("exit", (code) => process.exit(code ?? 0));
