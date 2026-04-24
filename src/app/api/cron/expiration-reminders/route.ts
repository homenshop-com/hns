import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendExpirationReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Milestones (days remaining) at which to send reminder emails. */
const MILESTONES = [7, 3, 1, 0] as const;

/**
 * GET /api/cron/expiration-reminders
 *
 * Sends expiration reminder emails to owners of free sites whose expiry is
 * approaching a milestone (7 / 3 / 1 / 0 days). Dedup via Site.lastReminderDay:
 * we only send when the current milestone is different from the stored one,
 * so each milestone triggers at most once per cycle. When the admin extends
 * expiresAt, applyPaidSubscription clears lastReminderDay so the next cycle
 * fires cleanly.
 *
 * Auth: Bearer CRON_SECRET OR localhost.
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

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  // Window: sites expiring within ~8 days (covers 7-day milestone with buffer).
  const windowEnd = new Date(now + 8 * msPerDay);

  const sites = await prisma.site.findMany({
    where: {
      accountType: "0",
      isTemplateStorage: false,
      expiresAt: { not: null, lte: windowEnd },
    },
    select: {
      id: true,
      shopId: true,
      name: true,
      expiresAt: true,
      lastReminderDay: true,
      user: { select: { email: true, name: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ shopId: string; days: number; ok: boolean }> = [];

  for (const site of sites) {
    if (!site.expiresAt) continue;
    const daysRemaining = Math.ceil(
      (new Date(site.expiresAt).getTime() - now) / msPerDay
    );
    // Pick the milestone matching today (exact equality so we fire on the right day)
    const milestone = MILESTONES.find((m) => m === daysRemaining);
    if (milestone === undefined) {
      skipped++;
      continue;
    }
    // Dedup: already sent this milestone this cycle
    if (site.lastReminderDay === milestone) {
      skipped++;
      continue;
    }
    const to = site.user?.email;
    if (!to) {
      skipped++;
      continue;
    }

    const ok = await sendExpirationReminderEmail(to, {
      siteName: site.name || site.shopId,
      shopId: site.shopId,
      daysRemaining: milestone,
      expiresAt: site.expiresAt.toISOString(),
      extendUrl: `https://homenshop.com/dashboard/site/${site.id}/extend`,
    });

    if (ok) {
      await prisma.site.update({
        where: { id: site.id },
        data: { lastReminderDay: milestone },
      });
      sent++;
    } else {
      failed++;
    }
    results.push({ shopId: site.shopId, days: milestone, ok });
  }

  return NextResponse.json({
    ok: true,
    scanned: sites.length,
    sent,
    skipped,
    failed,
    results,
  });
}
