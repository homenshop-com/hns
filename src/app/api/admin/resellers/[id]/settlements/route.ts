import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getHistory,
  getSummary,
  recordPayout,
  adminAdjust,
} from "@/lib/reseller-revenue";

async function requireAdmin(): Promise<{ adminId: string } | null> {
  const session = await auth();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") return null;
  return { adminId: session.user.id };
}

// GET — settlement history + summary for a reseller (admin only).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const [summary, history] = await Promise.all([
    getSummary(id),
    getHistory(id, limit, offset),
  ]);

  return NextResponse.json({ summary, history });
}

// POST — record a payout or manual adjustment (admin only).
// Body: { action: "payout" | "adjust", amount: number, note?: string }
//   payout: amount is positive KRW paid out (stored negative).
//   adjust: amount is signed KRW (positive credits, negative debits).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const reseller = await prisma.reseller.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!reseller) {
    return NextResponse.json(
      { error: "리셀러를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { action, amount, note } = body as {
    action?: string;
    amount?: number;
    note?: string;
  };

  const amt = Number(amount);
  if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
    return NextResponse.json(
      { error: "금액은 정수(원)여야 합니다." },
      { status: 400 }
    );
  }

  try {
    if (action === "payout") {
      if (amt <= 0) {
        return NextResponse.json(
          { error: "출금액은 1원 이상이어야 합니다." },
          { status: 400 }
        );
      }
      const balance = await recordPayout({
        resellerId: id,
        amount: amt,
        adminUserId: admin.adminId,
        note: note?.trim() || undefined,
      });
      return NextResponse.json({ ok: true, balance });
    }

    if (action === "adjust") {
      if (amt === 0) {
        return NextResponse.json(
          { error: "조정 금액은 0일 수 없습니다." },
          { status: 400 }
        );
      }
      const balance = await adminAdjust({
        resellerId: id,
        amount: amt,
        adminUserId: admin.adminId,
        note: note?.trim() || undefined,
      });
      return NextResponse.json({ ok: true, balance });
    }

    return NextResponse.json(
      { error: "action은 'payout' 또는 'adjust'여야 합니다." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[admin/resellers/settlements] failed:", err);
    return NextResponse.json(
      { error: "정산 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
