// Keep saved settings using the original Instagram thumbnail compatible with the restored logo.
export const DEFAULT_LOGO = "/media/dreamcars-logo-hd.png";
export function brandLogo(source: string) {
  if (!source || source === "/media/logo.jpg" || source === DEFAULT_LOGO) {
    return `${DEFAULT_LOGO}?v=2012`;
  }
  return source;
}

export function normalizeWhatsappNumber(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^09\d{8}$/.test(digits)) return `595${digits.slice(1)}`;
  if (/^9\d{8}$/.test(digits)) return `595${digits}`;
  if (/^59509\d{8}$/.test(digits)) return `595${digits.slice(4)}`;
  return digits;
}

export function formatPhone(raw: string): string {
  const normalized = normalizeWhatsappNumber(raw);
  if (!normalized) return raw || "";
  if (/^5959\d{8}$/.test(normalized)) {
    return `+595 ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9, 12)}`;
  }
  if (/^595\d{7,9}$/.test(normalized)) {
    return `+595 ${normalized.slice(3)}`;
  }
  return `+${normalized}`;
}

export const whatsapp = (
  number: string,
  message = "¡Hola, Dream Cars! Quiero conocer más sobre sus vehículos."
) => `https://wa.me/${normalizeWhatsappNumber(number)}?text=${encodeURIComponent(message)}`;
