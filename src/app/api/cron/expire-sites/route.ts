import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/expire-sites
 *
 * Once per day, flip `published=false` on every free (accountType="0") site
 * whose `expiresAt` is in the past. Paid sites are left alone — their expiry
 * is managed by the subscription payment flow; admins handle edge cases.
 *
 * accountType itself is NOT mutated. The owner keeps seeing the site in the
 * dashboard (so they can renew), but visitors stop reaching the published
 * pages. Admins can set accountType="9" manually to hard-disable further.
 *
 * Template storage sites (isTemplateStorage=true) are excluded — they're
 * internal scaffolding, not user-facing.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` OR localhost. Mirrors
 * /api/cron/monthly-credits.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const headerAuth = request.headers.get("authorization") || "";
  const token = headerAuth.replace(/^Bearer\s+/i, "").trim();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "";
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "";

  if (expected && token !== expected && !isLocalhost) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const expiredSites = await prisma.site.findMany({
    where: {
      accountType: "0",
      isTemplateStorage: false,
      published: true,
      expiresAt: { lt: now },
    },
    select: { id: true, shopId: true, userId: true, expiresAt: true },
  });

  if (expiredSites.length === 0) {
    return NextResponse.json({ ok: true, expired: 0, now });
  }

  const ids = expiredSites.map((s) => s.id);
  const result = await prisma.site.updateMany({
    where: { id: { in: ids } },
    data: { published: false },
  });

  console.log(
    `[expire-sites] unpublished ${result.count} expired free sites:`,
    expiredSites.map((s) => s.shopId).join(", ")
  );

  return NextResponse.json({
    ok: true,
    expired: result.count,
    sites: expiredSites.map((s) => ({
      shopId: s.shopId,
      expiresAt: s.expiresAt,
    })),
    now,
  });
}
