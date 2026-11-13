// Keep saved settings using the original Instagram thumbnail compatible with the restored logo.
export const DEFAULT_LOGO = "/media/dreamcars-logo-hd.png";
export function brandLogo(source: string) {
  return !source || source === "/media/logo.jpg" ? DEFAULT_LOGO : source;
}
