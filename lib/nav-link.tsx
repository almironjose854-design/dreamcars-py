import type { AnchorHTMLAttributes } from "react";

/**
 * Standard anchor wrapper replacing `next/link` so production builds on Vite 8 / Rolldown
 * never fail on mangled `vinext` client-router exports (`navigateClientSide`).
 */
export function Link({
  href,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}) {
  void _prefetch;
  void _replace;
  void _scroll;
  return <a href={href} {...props} />;
}
