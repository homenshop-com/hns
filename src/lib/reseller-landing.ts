import "server-only";
import { spawn } from "child_process";
import { prisma } from "@/lib/db";

/**
 * Reseller landing-page linking.
 *
 * A reseller (white-label) domain normally serves the whole platform with
 * the default landing at `/`. A reseller may instead point `/` at a Site they
 * built in the dashboard. Linking a landing Site:
 *   1. records Reseller.landingSiteId, and
 *   2. rewrites the domain's nginx vhost to a HYBRID config that serves the
 *      published site at page paths (/, /{lang}/*.html, assets) while keeping
 *      platform paths (/login, /dashboard, /admin, /api, /_next) on the app.
 *
 * Unlinking reverts the vhost to the plain proxy (default landing).
 *
 * The two scripts live on the server and reuse the reseller's existing
 * Let's Encrypt cert (issued when the reseller domain was first provisioned):
 *   · link   → provision-reseller-landing.sh <domain> <shopId> <lang>
 *   · unlink → provision-reseller-domain.sh  <domain>   (plain proxy vhost)
 *
 * Both are spawned detached/fire-and-forget — they run certbot/nginx which
 * blows past nginx's /api/ proxy_read_timeout, so the request must not wait.
 */

const LINK_SCRIPT = "/root/scripts/provision-reseller-landing.sh";
const UNLINK_SCRIPT = "/root/scripts/provision-reseller-domain.sh";

/** Public view of a Site shown in the landing UI (selector + linked status). */
export type LandingSiteView = {
  id: string;
  shopId: string;
  name: string;
  published: boolean;
};

function spawnDetached(script: string, args: string[]) {
  try {
    const child = spawn(script, args, {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        DB_PASSWORD: process.env.DB_PASSWORD || "HnsApp2026Secure",
      },
    });
    child.unref();
  } catch (err) {
    // Never let a provisioning hiccup fail the API call — the DB link is the
    // source of truth; nginx can be re-applied by re-saving. Log and move on.
    console.error("[reseller-landing] spawn failed:", script, args, err);
  }
}

/** Sites the given user owns that are eligible to be a landing page. */
export async function listCandidateSites(
  ownerUserId: string
): Promise<LandingSiteView[]> {
  return prisma.site.findMany({
    where: { userId: ownerUserId, isTemplateStorage: false },
    select: { id: true, shopId: true, name: true, published: true },
    orderBy: { createdAt: "desc" },
  });
}

export type LandingState = {
  domain: string;
  ownerUserId: string | null;
  landingSite: LandingSiteView | null;
  sites: LandingSiteView[];
};

/**
 * Current landing state for a reseller: the linked site (if any) and the list
 * of the owner's sites to choose from. `sites` is empty when the reseller has
 * no owner account yet (nothing can be linked until one is assigned).
 */
export async function getLandingState(
  resellerId: string
): Promise<LandingState | null> {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: {
      domain: true,
      ownerUserId: true,
      landingSite: {
        select: { id: true, shopId: true, name: true, published: true },
      },
    },
  });
  if (!reseller) return null;

  const sites = reseller.ownerUserId
    ? await listCandidateSites(reseller.ownerUserId)
    : [];

  return {
    domain: reseller.domain,
    ownerUserId: reseller.ownerUserId,
    landingSite: reseller.landingSite,
    sites,
  };
}

export type LinkResult =
  | { ok: true; landingSite: LandingSiteView }
  | { ok: false; status: number; error: string };

/**
 * Link `siteId` as the reseller's landing page.
 *
 * `expectedOwnerUserId` must equal the site's owner. For owner self-service
 * pass the caller's own userId; for an admin acting on a reseller pass the
 * reseller's ownerUserId. The site must not be a template-storage shell.
 */
export async function linkResellerLanding(
  resellerId: string,
  siteId: string,
  expectedOwnerUserId: string | null
): Promise<LinkResult> {
  if (!expectedOwnerUserId) {
    return {
      ok: false,
      status: 400,
      error: "리셀러 운영자 계정이 지정되어야 사이트를 연동할 수 있습니다.",
    };
  }

  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: { domain: true },
  });
  if (!reseller) {
    return { ok: false, status: 404, error: "리셀러를 찾을 수 없습니다." };
  }

  const site = await prisma.site.findFirst({
    where: {
      id: siteId,
      userId: expectedOwnerUserId,
      isTemplateStorage: false,
    },
    select: {
      id: true,
      shopId: true,
      name: true,
      published: true,
      defaultLanguage: true,
    },
  });
  if (!site) {
    return {
      ok: false,
      status: 403,
      error: "선택한 사이트를 찾을 수 없거나 권한이 없습니다.",
    };
  }

  await prisma.reseller.update({
    where: { id: resellerId },
    data: { landingSiteId: site.id },
  });

  spawnDetached(LINK_SCRIPT, [
    reseller.domain,
    site.shopId,
    site.defaultLanguage || "ko",
  ]);

  return {
    ok: true,
    landingSite: {
      id: site.id,
      shopId: site.shopId,
      name: site.name,
      published: site.published,
    },
  };
}

/** Unlink the reseller's landing page and revert the domain to plain proxy. */
export async function unlinkResellerLanding(
  resellerId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: { domain: true, landingSiteId: true },
  });
  if (!reseller) {
    return { ok: false, status: 404, error: "리셀러를 찾을 수 없습니다." };
  }

  if (reseller.landingSiteId) {
    await prisma.reseller.update({
      where: { id: resellerId },
      data: { landingSiteId: null },
    });
  }

  // Revert to the plain reseller vhost (default platform landing at /).
  spawnDetached(UNLINK_SCRIPT, [reseller.domain]);

  return { ok: true };
}
