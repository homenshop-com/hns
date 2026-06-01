/**
 * Resolve a reseller's stored `logo` value to a usable URL.
 *
 * Three shapes coexist:
 *  - legacy bare filename ("homenshop.com.png") → served from the legacy
 *    upload dir under /upld/uploaded/
 *  - an absolute path uploaded via /api/upload ("/uploads/reseller-logos/…")
 *  - a fully-qualified URL ("https://…/logo.png")
 *
 * Returns null when no logo is set.
 */
export function resolveResellerLogoUrl(logo: string | null | undefined): string | null {
  const v = (logo ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || v.startsWith("/")) return v;
  return `/upld/uploaded/${v}`;
}
