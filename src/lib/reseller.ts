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
  /** SEO overrides — each null when not customised (falls back to stock). */
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  /**
   * True for the homenshop.net row itself. It is editable through the same
   * admin UI as white-label resellers, but it is NOT white-label: keep its own
   * company footer block and locale-aware default title/description.
   */
  isCanonical: boolean;
};

/** The canonical (non-white-label) host that owns the default homeNshop brand. */
export const CANONICAL_HOST = "homenshop.net";

function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  // Strip port, lowercase, drop a leading www. so www.foo.com === foo.com.
  return host.split(":")[0].trim().toLowerCase().replace(/^www\./, "");
}

/**
 * True when `host` is a reseller's MULTI-TENANT member-site host —
 * `home.{active reseller domain}` (e.g. home.webnshop.com.au). These hosts
 * serve published member sites path-based (`/{shopId}/{lang}/...`), exactly
 * like home.homenshop.com, so the published route must treat them as managed
 * temp hosts (NOT per-site custom domains) — otherwise it drops the `/{shopId}`
 * URL prefix and internal links break (lose shopId, wrong lang → redirect loop).
 *
 * Cheap for non-`home.` hosts (string check, no DB). Only hits the DB when the
 * host actually starts with `home.`.
 */
export async function isResellerHomeHost(
  host: string | null | undefined,
): Promise<boolean> {
  const norm = normalizeHost(host ?? null);
  if (!norm || !norm.startsWith("home.")) return false;
  const base = norm.slice("home.".length);
  if (!base) return false;
  const r = await prisma.reseller.findFirst({
    where: { domain: base, isActive: true },
    select: { id: true },
  });
  return !!r;
}

export type ResellerHomeBranding = { domain: string; siteName: string };

/**
 * Like {@link isResellerHomeHost} but returns the reseller's brand (domain +
 * site name) for a `home.{domain}` host, or null. Used by the published route
 * to render white-label expired / "not found" / preparing pages — so a
 * reseller member-site host NEVER shows the homeNshop brand or links to
 * homenshop.com / .net. Cheap for non-`home.` hosts (no DB).
 */
export async function getResellerHomeBranding(
  host: string | null | undefined,
): Promise<ResellerHomeBranding | null> {
  const norm = normalizeHost(host ?? null);
  if (!norm || !norm.startsWith("home.")) return null;
  const base = norm.slice("home.".length);
  if (!base) return null;
  const r = await prisma.reseller.findFirst({
    where: { domain: base, isActive: true },
    select: { domain: true, siteName: true },
  });
  return r ? { domain: r.domain, siteName: r.siteName } : null;
}

/**
 * Resolve white-label branding for the current request's Host header.
 *
 * Mirrors the legacy lib/global.php behaviour (`select * from reseller where
 * domain = ...`): a non-default host that matches an ACTIVE reseller row gets
 * that reseller's site name / logo / copyright. homenshop.net (the canonical
 * default) and any unmatched host fall back to stock homeNshop branding.
 *
 * Legacy logos live under /upld/uploaded/<filename> (nginx aliases /upld/ to
 * the legacy upload dir). The file may be missing for some resellers, so the
 * UI must degrade gracefully when the image 404s — see <BrandMark>.
 */
export async function getResellerForHost(): Promise<ResellerBranding | null> {
  const h = await headers();
  const host = normalizeHost(h.get("host"));
  if (!host) return null;

  const r = await prisma.reseller.findFirst({
    where: { domain: host, isActive: true },
    select: {
      domain: true,
      siteName: true,
      logo: true,
      copyright: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
    },
  });
  if (!r) return null;

  return {
    domain: r.domain,
    siteName: r.siteName,
    logoUrl: resolveResellerLogoUrl(r.logo),
    copyright: r.copyright,
    metaTitle: r.metaTitle,
    metaDescription: r.metaDescription,
    metaKeywords: r.metaKeywords,
    isCanonical: r.domain === CANONICAL_HOST,
  };
}

export type ActiveResellerRef = {
  id: string;
  domain: string;
  isCanonical: boolean;
  revenueShareBps: number;
};

/**
 * Look up the ACTIVE reseller for an explicit host string (e.g. the Host
 * header captured at signup). Unlike getResellerForHost(), this takes the host
 * as an argument so it can be used outside the request-rendering context (API
 * routes that read headers themselves). Returns null for unmatched hosts.
 *
 * Used for revenue-share attribution: a customer who signs up on a white-label
 * reseller domain is permanently attributed to that reseller. The canonical
 * homenshop.net row is returned with isCanonical=true so callers can skip
 * attribution for direct signups.
 */
export async function findActiveResellerByHost(
  host: string | null
): Promise<ActiveResellerRef | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const r = await prisma.reseller.findFirst({
    where: { domain: normalized, isActive: true },
    select: { id: true, domain: true, revenueShareBps: true },
  });
  if (!r) return null;
  return {
    id: r.id,
    domain: r.domain,
    isCanonical: r.domain === CANONICAL_HOST,
    revenueShareBps: r.revenueShareBps,
  };
}
