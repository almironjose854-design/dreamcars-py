export const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();
export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function randomToken(length = 32): string { return base64url(crypto.getRandomValues(new Uint8Array(length))); }
export async function digest(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const left = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(a)));
  const right = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(b)));
  return left.reduce((diff, byte, i) => diff | (byte ^ right[i]), 0) === 0;
}
export async function passwordHash(password: string, salt: string, pepper: string): Promise<string> {
  const pepperKey = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prehash = await crypto.subtle.sign("HMAC", pepperKey, encoder.encode(password));
  const key = await crypto.subtle.importKey("raw", prehash, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: PASSWORD_ITERATIONS }, key, 256);
  return base64url(new Uint8Array(bits));
}
export function validateNewPassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 14 || password.length > 128 || password.trim().length < 14)
    throw new Error("Usá una contraseña o frase de entre 14 y 128 caracteres.");
}
