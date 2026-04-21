import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { grantCredits, MONTHLY_GRANT_PAID } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/monthly-credits
 *
 * Intended to be hit once per day by a server cron (see /root/scripts/
 * daily-backup.sh for the existing cron pattern). Grants MONTHLY_GRANT_PAID
 * credits to every user whose last grant was ≥ 30 days ago and who owns at
 * least one active, non-expired paid site (accountType="1", expiresAt in
 * the future).
 *
 * Idempotent — never double-grants within 30 days for the same user.
 *
 * Auth: requires `Authorization: Bearer $CRON_SECRET` header, OR localhost
 * (common for server-side curl). Anonymous internet calls are 401.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const headerAuth = request.headers.get("authorization") || "";
  const token = headerAuth.replace(/^Bearer\s+/i, "").trim();

  // Allow localhost calls without secret for quick ops on the server box.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "";
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "";

  if (expected && token !== expected && !isLocalhost) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const thresholdAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Eligible users: owns at least one paid+active site, AND never granted OR last grant >=30 days ago.
  const candidates = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      sites: {
        some: {
          accountType: "1",
          isTemplateStorage: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      },
      OR: [
        { lastMonthlyGrantAt: null },
        { lastMonthlyGrantAt: { lte: thresholdAgo } },
      ],
    },
    select: { id: true, email: true, lastMonthlyGrantAt: true },
  });

  let granted = 0;
  let failed = 0;
  for (const user of candidates) {
    try {
      await grantCredits(user.id, {
        kind: "MONTHLY_GRANT",
        amount: MONTHLY_GRANT_PAID,
        description: `유료 플랜 월별 지급 (${MONTHLY_GRANT_PAID} C)`,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { lastMonthlyGrantAt: now },
      });
      granted++;
    } catch (err) {
      failed++;
      console.error("[cron] monthly grant failed for", user.email, err);
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    granted,
    failed,
    creditsPerUser: MONTHLY_GRANT_PAID,
    totalCreditsGranted: granted * MONTHLY_GRANT_PAID,
  });
}
