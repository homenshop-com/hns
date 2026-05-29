import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAnalyticsSummary } from "@/lib/analytics";

/**
 * GA4 reporting data for the admin dashboard.
 *
 * Used in two ways:
 *  - Server component on /admin renders the initial paint (direct lib call).
 *  - This route powers the client-side refresh (e.g., realtime users polling).
 *
 * Cached on the route handler — `dynamic = "force-dynamic"` keeps it fresh.
 */
export const dynamic = "force-dynamic";

async function isAdmin() {
  const session = await auth();
  if (!session) return false;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "ADMIN";
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await getAnalyticsSummary();
  return NextResponse.json(summary, {
    // Realtime panel polls this — don't let any layer cache.
    headers: { "Cache-Control": "no-store" },
  });
}
