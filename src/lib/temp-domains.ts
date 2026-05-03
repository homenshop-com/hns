/**
 * Managed "temporary" domains — multi-tenant hosts that serve every site
 * via path-based routing (`/{shopId}/{lang}/...`). nginx is configured
 * to land every host listed here on the same Next.js vhost, so adding a
 * new entry needs three things in lockstep: this constant, DNS A record
 * to 167.71.199.28, and an `acme.sh` cert + nginx `server_name` line.
 *
 * Per-site selection lives in `Site.tempDomain`. Custom domains bound
 * via the `Domain` model take precedence and are NOT in this list.
 */
export const TEMP_DOMAINS = [
  "home.homenshop.com",
  "aesthetic.helper.so",
  "beauty.helper.so",
  "www.helper.so",
] as const;

export type TempDomain = (typeof TEMP_DOMAINS)[number];

export const DEFAULT_TEMP_DOMAIN: TempDomain = "home.homenshop.com";

export function isAllowedTempDomain(value: unknown): value is TempDomain {
  return typeof value === "string" && (TEMP_DOMAINS as readonly string[]).includes(value);
}

/**
 * Resolve the temp domain for a site, falling back to the default when
 * the stored value is missing or no longer allowed (e.g. retired alias).
 */
export function getTempDomain(site: { tempDomain?: string | null } | null | undefined): TempDomain {
  const v = site?.tempDomain;
  return isAllowedTempDomain(v) ? v : DEFAULT_TEMP_DOMAIN;
}

/**
 * True when an incoming Host header is one of our managed temp domains.
 * Used by the published route to distinguish path-based multi-tenant
 * hosts (where `/{shopId}` is the URL prefix) from per-site bound
 * custom domains (no shopId in the path).
 */
export function isManagedTempHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const bare = host.split(":")[0].toLowerCase();
  return (TEMP_DOMAINS as readonly string[]).includes(bare);
}
