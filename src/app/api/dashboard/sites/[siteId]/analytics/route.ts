import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAnalyticsSummary } from "@/lib/analytics";

/**
 * GA4 data for a user-owned site.
 *
 * Authorization: the requester must be signed in AND the site's owner.
 * Reads the Property ID stored on the Site row (set by the user via the
 * /dashboard/.../config/analytics page) and runs the Data API against it
 * using the shared service account.
 *
 * If the user hasn't connected GA yet (Property ID blank) or hasn't yet
 * granted our service account Viewer access on their GA property, we
 * return a `configured: false` payload — the dashboard then renders the
 * onboarding/troubleshooting card instead of crashing.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await context.params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, userId: true, googleAnalyticsPropertyId: true },
  });

  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!site.googleAnalyticsPropertyId) {
    return NextResponse.json(
      { configured: false, reason: "Property ID 미설정 — 설정 페이지에서 추가하세요" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const summary = await getAnalyticsSummary(site.googleAnalyticsPropertyId);
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
