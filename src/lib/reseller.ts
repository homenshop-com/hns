import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { resolveResellerLogoUrl } from "@/lib/reseller-logo";

export type ResellerBranding = {
  domain: string;
  siteName: string;
  /** Resolved URL for the reseller logo, or null when no logo is configured. */
  logoUrl: string | null;
  /** White-label copyright/footer HTML (admin-managed, trusted). */
  copyright: string | null;
};

function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  // Strip port, lowercase, drop a leading www. so www.foo.com === foo.com.
  return host.split(":")[0].trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Resolve white-label branding for the current request's Host header.
 *
 * Mirrors the legacy lib/global.php behaviour (`select * from reseller where
 * domain = ...`): a non-default host that matches an ACTIVE reseller row gets
 * that reseller's site name / logo / copyright. homenshop.com (the canonical
 * default) and any unmatched host fall back to stock homeNshop branding.
 *
 * Legacy logos live under /upld/uploaded/<filename> (nginx aliases /upld/ to
 * the legacy upload dir). The file may be missing for some resellers, so the
 * UI must degrade gracefully when the image 404s — see <BrandMark>.
 */
export async function getResellerForHost(): Promise<ResellerBranding | null> {
  const h = await headers();
  const host = normalizeHost(h.get("host"));
  if (!host || host === "homenshop.com") return null;

  const r = await prisma.reseller.findFirst({
    where: { domain: host, isActive: true },
    select: { domain: true, siteName: true, logo: true, copyright: true },
  });
  if (!r) return null;

  return {
    domain: r.domain,
    siteName: r.siteName,
    logoUrl: resolveResellerLogoUrl(r.logo),
    copyright: r.copyright,
  };
}
