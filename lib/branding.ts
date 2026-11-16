// Keep saved settings using the original Instagram thumbnail compatible with the restored logo.
export const DEFAULT_LOGO = "/media/dreamcars-logo-hd.png";
export function brandLogo(source: string) {
  if (!source || source === "/media/logo.jpg" || source === DEFAULT_LOGO) {
    return `${DEFAULT_LOGO}?v=2012`;
  }
  return source;
}
