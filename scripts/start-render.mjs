import { existsSync, copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";
import { projectRoot } from "./sites-env.mjs";

const crypto = globalThis.crypto ?? webcrypto;
const encoder = new TextEncoder();

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
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

  if (existsSync(rootVars)) {
    copyFileSync(rootVars, distVars);
    return;
  }

  const authSecret = process.env.ADMIN_AUTH_SECRET || base64url(crypto.getRandomValues(new Uint8Array(32)));
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY || base64url(crypto.getRandomValues(new Uint8Array(32)));
  let bootstrapAccount = process.env.ADMIN_BOOTSTRAP_ACCOUNT;

  if (!bootstrapAccount) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || "DreamCars-Admin-2026!";
    const salt = "dreamcars-render-salt";
    const passwordHash = await derivePasswordHash(initialPassword, salt, authSecret);
    bootstrapAccount = JSON.stringify({
      username: (process.env.ADMIN_USERNAME || "admin").toLowerCase(),
      displayName: "Dream Cars PY",
      salt,
      passwordHash,
      version: "v1-render-bootstrap",
      mustChangePassword: Boolean(process.env.ADMIN_MUST_CHANGE_PASSWORD === "true"),
      updatedAt: new Date().toISOString(),
    });
  }

  const lines = [
    `ADMIN_AUTH_SECRET=${JSON.stringify(authSecret)}`,
    `INTEGRATION_ENCRYPTION_KEY=${JSON.stringify(encKey)}`,
    `ADMIN_BOOTSTRAP_ACCOUNT=${JSON.stringify(bootstrapAccount)}`,
  ];

  for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
    if (process.env[key]) {
      lines.push(`${key}=${JSON.stringify(process.env[key])}`);
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
