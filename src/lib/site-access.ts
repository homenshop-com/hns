import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Site management access model (design + data surface).
 *
 * A site's "manager" is normally its owner (Site.userId === session user). In
 * addition, a white-label reseller operator (the User that owns a Reseller via
 * Reseller.ownerUserId) may manage the DESIGN and DATA of any site whose owner
 * is attributed to that reseller (Site.user.resellerId === reseller.id).
 *
 * This covers: pages/designer, boards, products, site settings, menus, domains
 * — i.e. everything a reseller needs to build/maintain a customer's site with
 * their OWN session (no impersonation, no master password).
 *
 * It deliberately does NOT cover billing-sensitive surfaces (credits, payments,
 * orders, settlement, integrations). Those remain strict owner-only and must
 * keep using `userId === session.user.id` checks — a reseller must never be able
 * to spend a customer's credits or see their payment data through this scope.
 */
export type ManageScope = {
  userId: string;
  /** Reseller this operator owns, or null if they are an ordinary member. */
  resellerId: string | null;
};

/** Resolve the current session's site-management scope, or null if signed out. */
export async function getManageScope(): Promise<ManageScope | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { ownedReseller: { select: { id: true } } },
  });
  return {
    userId: session.user.id,
    resellerId: user?.ownedReseller?.id ?? null,
  };
}

/**
 * Prisma `where` fragment selecting every site this scope may manage:
 *  - ordinary member → only their own sites
 *  - reseller operator → their own sites OR sites owned by a user attributed to
 *    their reseller.
 */
export function manageableSiteWhere(scope: ManageScope): Prisma.SiteWhereInput {
  if (scope.resellerId) {
    return {
      OR: [
        { userId: scope.userId },
        { user: { resellerId: scope.resellerId } },
      ],
    };
  }
  return { userId: scope.userId };
}

/** True when `scope` may manage a site owned by `ownerUserId`/attributed to
 *  `ownerResellerId`. Use when you already loaded the site's owner fields. */
export function canManage(
  scope: ManageScope,
  site: { userId: string; ownerResellerId: string | null },
): boolean {
  if (site.userId === scope.userId) return true;
  if (scope.resellerId && site.ownerResellerId === scope.resellerId) return true;
  return false;
}

/**
 * Load a site by id and verify the current session may manage it. Returns the
 * site (with owner attribution) when allowed, or null otherwise (not found OR
 * forbidden — callers should treat both as 403/redirect).
 */
export async function canManageSite(
  siteId: string,
): Promise<{ id: string; userId: string; ownerResellerId: string | null } | null> {
  const scope = await getManageScope();
  if (!scope) return null;
  const site = await prisma.site.findFirst({
    where: { id: siteId, ...manageableSiteWhere(scope) },
    select: { id: true, userId: true, user: { select: { resellerId: true } } },
  });
  if (!site) return null;
  return {
    id: site.id,
    userId: site.userId,
    ownerResellerId: site.user.resellerId,
  };
}
