import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getHistory, getSummary } from "@/lib/reseller-revenue";

// GET /api/reseller/earnings — the signed-in user's owned-reseller settlement
// summary + history. Authorization is ownership: a user may only read the
// reseller they own (Reseller.ownerUserId === session user). Returns 404 when
// the user owns no reseller.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reseller = await prisma.reseller.findUnique({
    where: { ownerUserId: session.user.id },
    select: {
      id: true,
      domain: true,
      siteName: true,
      revenueShareBps: true,
    },
  });
  if (!reseller) {
    return NextResponse.json(
      { error: "연결된 리셀러가 없습니다." },
      { status: 404 }
    );
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const [summary, history] = await Promise.all([
    getSummary(reseller.id),
    getHistory(reseller.id, limit, offset),
  ]);

  return NextResponse.json({
    reseller: {
      domain: reseller.domain,
      siteName: reseller.siteName,
      revenueSharePercent: reseller.revenueShareBps / 100,
    },
    summary,
    history,
  });
}
