import { env } from "cloudflare:workers";
import { ApiError, bucket, readDoc, recordAudit, writeDoc } from "./store";
import { digest, passwordHash, randomToken, sameSecret, validateNewPassword } from "./password";

export type AdminAccount = {
  username: string;
  displayName: string;
  salt: string;
  passwordHash: string;
  version: string;
  mustChangePassword: boolean;
  recoveryCodeHashes?: string[];
  recoveryCodesUpdatedAt?: string;
  updatedAt: string;
};
type AdminSession = { version: string; csrfToken: string; createdAt: number; expiresAt: number; remember: boolean };
const ACCOUNT_KEY = "private/auth/account.json";
const normalize = (value: string) => value.trim().toLowerCase();
const normalizeRecoveryCode = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

function formatRecoveryCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let chars = "";
  for (let i = 0; i < 8; i++) chars += alphabet[bytes[i] % alphabet.length];
  return `DC-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

function secret() {
  if (!env.ADMIN_AUTH_SECRET) throw new ApiError(503, "El acceso administrativo todavía no está configurado.");
  return env.ADMIN_AUTH_SECRET;
}

async function account() {
  const stored = await readDoc<AdminAccount | null>(ACCOUNT_KEY, null);
  if (stored.data) return stored as { data: AdminAccount; etag: string };
  let initial: AdminAccount;
  try {
    initial = JSON.parse(env.ADMIN_BOOTSTRAP_ACCOUNT || "");
  } catch {
    throw new ApiError(503, "El acceso administrativo todavía no está configurado.");
  }
  if (!initial.username || !initial.passwordHash || !initial.salt || !initial.version) {
    throw new ApiError(503, "Falta configurar la cuenta administradora.");
  }
  return { data: initial, etag: null };
}

function isHttps(req: Request) {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

function cookieName(req: Request) {
  return isHttps(req) ? "__Host-dreamcars_session" : "dreamcars_session";
}

function tokenFrom(req: Request) {
  const name = cookieName(req) + "=";
  const values = (req.headers.get("cookie") || "")
    .split(";")
    .map(v => v.trim())
    .filter(v => v.startsWith(name));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function cookie(req: Request, token: string, maxAge: number) {
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;
}

export async function adminSession(req: Request) {
  const token = tokenFrom(req);
  if (!token) return null;
  const key = `private/auth/sessions/${await digest(token)}.json`;
  const session = await readDoc<AdminSession | null>(key, null);
  if (!session.data) return null;
  const current = await account();
  if (session.data.expiresAt <= Date.now() || session.data.version !== current.data.version) {
    await bucket().delete(key);
    return null;
  }
  return { account: current.data, accountEtag: current.etag, session: session.data, key };
}

export async function sessionInfo(req: Request) {
  const auth = await adminSession(req);
  return auth
    ? {
        isAdmin: true,
        user: { username: auth.account.username, displayName: auth.account.displayName },
        mustChangePassword: auth.account.mustChangePassword,
        csrfToken: auth.session.csrfToken,
        expiresAt: auth.session.expiresAt,
        recoveryCodesCount: auth.account.recoveryCodeHashes?.length ?? 0
      }
    : {
        isAdmin: false,
        user: null,
        mustChangePassword: false,
        csrfToken: null,
        expiresAt: null,
        recoveryCodesCount: 0
      };
}

export async function requireAdmin(req: Request, allowInitial = false) {
  const auth = await adminSession(req);
  if (!auth) throw new ApiError(401, "Tu sesión terminó. Ingresá nuevamente con tu usuario y contraseña.");
  if (req.method !== "GET" && !(await sameSecret(req.headers.get("x-csrf-token") || "", auth.session.csrfToken))) {
    throw new ApiError(403, "Actualizá la página para volver a intentar la operación.");
  }
  if (!allowInitial && auth.account.mustChangePassword) {
    throw new ApiError(403, "Elegí tu contraseña personal antes de continuar.");
  }
  return auth;
}

async function loginQuota(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local-preview";
  const fingerprint = await digest(secret() + ":login:" + ip);
  const window = Math.floor(Date.now() / 900000);
  const prefix = `private/auth/limits/${fingerprint}/`;
  const old = await bucket().list({ prefix });
  const expired = old.objects.filter(o => Number(o.key.slice(prefix.length).split("-")[0]) < window).map(o => o.key);
  if (expired.length) await bucket().delete(expired);
  for (let i = 0; i < 8; i++) {
    const key = `${prefix}${window}-${i}.json`;
    if (await bucket().head(key)) continue;
    const result = await bucket().put(key, JSON.stringify({ expiresAt: (window + 1) * 900000 }), {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" }
    });
    if (result) return { prefix, window };
  }
  throw new ApiError(429, "Demasiados intentos de acceso. Esperá 15 minutos y volvé a intentar.");
}

async function createSession(req: Request, current: AdminAccount, remember: boolean) {
  const token = randomToken();
  const createdAt = Date.now();
  const seconds = remember ? 7 * 86400 : 12 * 3600;
  const session: AdminSession = {
    version: current.version,
    csrfToken: randomToken(),
    createdAt,
    expiresAt: createdAt + seconds * 1000,
    remember
  };
  await writeDoc(`private/auth/sessions/${await digest(token)}.json`, session, null, false);
  return {
    cookie: cookie(req, token, seconds),
    result: {
      isAdmin: true,
      user: { username: current.username, displayName: current.displayName },
      mustChangePassword: current.mustChangePassword,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      recoveryCodesCount: current.recoveryCodeHashes?.length ?? 0
    }
  };
}

export async function login(req: Request, input: { username?: unknown; password?: unknown; remember?: unknown }) {
  const quota = await loginQuota(req);
  const current = await account();
  const username = typeof input.username === "string" ? normalize(input.username).slice(0, 64) : "";
  const supplied = typeof input.password === "string" && input.password.length <= 128 ? input.password : "";
  const hash = await passwordHash(supplied, current.data.salt, secret());
  if (!(await sameSecret(hash, current.data.passwordHash)) || !(await sameSecret(username, current.data.username))) {
    throw new ApiError(401, "El usuario o la contraseña no son correctos.");
  }
  if (!current.etag) await writeDoc(ACCOUNT_KEY, current.data, null, false);
  const limits = await bucket().list({ prefix: `${quota.prefix}${quota.window}-` });
  if (limits.objects.length) await bucket().delete(limits.objects.map(o => o.key));
  const sessions = await bucket().list({ prefix: "private/auth/sessions/", limit: 100 });
  for (const item of sessions.objects) {
    if (item.uploaded.getTime() < Date.now() - 7 * 86400000) await bucket().delete(item.key);
  }
  return createSession(req, current.data, input.remember === true);
}

export async function logout(req: Request) {
  const auth = await adminSession(req);
  if (auth) {
    if (!(await sameSecret(req.headers.get("x-csrf-token") || "", auth.session.csrfToken))) {
      throw new ApiError(403, "Actualizá la página y volvé a intentar.");
    }
    await bucket().delete(auth.key);
  }
  return cookie(req, "", 0);
}

export async function updateAccount(
  req: Request,
  input: { currentPassword?: unknown; newPassword?: unknown; username?: unknown; displayName?: unknown }
) {
  const auth = await requireAdmin(req, true);
  await loginQuota(req);
  const oldPassword = typeof input.currentPassword === "string" && input.currentPassword.length <= 128 ? input.currentPassword : "";
  const oldHash = await passwordHash(oldPassword, auth.account.salt, secret());
  if (!(await sameSecret(oldHash, auth.account.passwordHash))) {
    throw new ApiError(400, "La contraseña actual no es correcta.");
  }
  try {
    validateNewPassword(input.newPassword);
  } catch (error) {
    throw new ApiError(400, (error as Error).message);
  }
  if (await sameSecret(oldPassword, input.newPassword)) {
    throw new ApiError(400, "Elegí una contraseña diferente a la actual.");
  }
  const username = typeof input.username === "string" ? normalize(input.username) : auth.account.username;
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw new ApiError(400, "El usuario debe tener de 3 a 40 letras, números, puntos, guiones o guiones bajos.");
  }
  const salt = randomToken(24);
  const next: AdminAccount = {
    username,
    displayName: typeof input.displayName === "string" ? input.displayName.trim().slice(0, 80) || "Administrador" : auth.account.displayName,
    salt,
    passwordHash: await passwordHash(input.newPassword, salt, secret()),
    version: randomToken(24),
    mustChangePassword: false,
    recoveryCodeHashes: auth.account.recoveryCodeHashes,
    recoveryCodesUpdatedAt: auth.account.recoveryCodesUpdatedAt,
    updatedAt: new Date().toISOString()
  };
  await writeDoc(ACCOUNT_KEY, next, auth.accountEtag, false);
  await bucket().delete(auth.key);
  await recordAudit(next.username, "account.update", next.username, "Credenciales de cuenta actualizadas");
  return createSession(req, next, auth.session.remember);
}

export async function generateRecoveryCodes(req: Request, input: { currentPassword?: unknown }) {
  const auth = await requireAdmin(req);
  await loginQuota(req);
  const supplied = typeof input.currentPassword === "string" && input.currentPassword.length <= 128 ? input.currentPassword : "";
  const hash = await passwordHash(supplied, auth.account.salt, secret());
  if (!(await sameSecret(hash, auth.account.passwordHash))) {
    throw new ApiError(400, "Ingresá tu contraseña actual para generar códigos de respaldo.");
  }
  const plainCodes = Array.from({ length: 8 }, () => formatRecoveryCode());
  const codeHashes = await Promise.all(
    plainCodes.map(code => passwordHash(normalizeRecoveryCode(code), "recovery-v1", secret()))
  );
  const next: AdminAccount = {
    ...auth.account,
    recoveryCodeHashes: codeHashes,
    recoveryCodesUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await writeDoc(ACCOUNT_KEY, next, auth.accountEtag, false);
  await recordAudit(auth.account.username, "account.update", auth.account.username, "Generó 8 códigos de recuperación de acceso");
  return { codes: plainCodes, count: plainCodes.length };
}

export async function recoverWithCode(
  req: Request,
  input: { username?: unknown; recoveryCode?: unknown; newPassword?: unknown }
) {
  const quota = await loginQuota(req);
  const current = await account();
  const username = typeof input.username === "string" ? normalize(input.username).slice(0, 64) : "";
  const rawCode = typeof input.recoveryCode === "string" ? normalizeRecoveryCode(input.recoveryCode) : "";
  if (!rawCode || rawCode.length < 8 || !current.data.recoveryCodeHashes?.length) {
    throw new ApiError(401, "El usuario o el código de recuperación no son válidos.");
  }
  const candidateHash = await passwordHash(rawCode, "recovery-v1", secret());
  let matchedIdx = -1;
  for (let i = 0; i < current.data.recoveryCodeHashes.length; i++) {
    if (await sameSecret(candidateHash, current.data.recoveryCodeHashes[i])) {
      matchedIdx = i;
    }
  }
  const validUser = await sameSecret(username, current.data.username);
  if (!validUser || matchedIdx === -1) {
    throw new ApiError(401, "El usuario o el código de recuperación no son válidos.");
  }
  try {
    validateNewPassword(input.newPassword);
  } catch (error) {
    throw new ApiError(400, (error as Error).message);
  }
  const salt = randomToken(24);
  const remainingHashes = current.data.recoveryCodeHashes.filter((_, idx) => idx !== matchedIdx);
  const next: AdminAccount = {
    ...current.data,
    salt,
    passwordHash: await passwordHash(input.newPassword, salt, secret()),
    version: randomToken(24),
    mustChangePassword: false,
    recoveryCodeHashes: remainingHashes,
    updatedAt: new Date().toISOString()
  };
  await writeDoc(ACCOUNT_KEY, next, current.etag, false);
  const limits = await bucket().list({ prefix: `${quota.prefix}${quota.window}-` });
  if (limits.objects.length) await bucket().delete(limits.objects.map(o => o.key));
  await recordAudit(next.username, "recovery.used", next.username, "Recuperó el acceso con un código de respaldo");
  return createSession(req, next, false);
}

export async function revokeSessions(req: Request) {
  const auth = await requireAdmin(req);
  const next = { ...auth.account, version: randomToken(24), updatedAt: new Date().toISOString() };
  await writeDoc(ACCOUNT_KEY, next, auth.accountEtag, false);
  return cookie(req, "", 0);
}
