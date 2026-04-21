import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { adminAdjust, getBalance, getHistory } from "@/lib/credits";

/** Admin-only: GET a user's balance + recent credit history. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (admin?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [balance, history] = await Promise.all([
    getBalance(id),
    getHistory(id, 100),
  ]);
  return NextResponse.json({ balance, history });
}

/**
 * Admin-only: adjust a user's credit balance.
 * Body: { amount: number (non-zero, can be negative), description?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (admin?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const amount = Number(body?.amount);
  const description = typeof body?.description === "string" ? body.description : undefined;

  if (!Number.isInteger(amount) || amount === 0) {
    return NextResponse.json(
      { error: "amount는 0이 아닌 정수여야 합니다." },
      { status: 400 }
    );
  }
  if (Math.abs(amount) > 1_000_000) {
    return NextResponse.json(
      { error: "한 번에 조정 가능한 한도(±1,000,000 C)를 초과했습니다." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "대상 회원을 찾을 수 없습니다." }, { status: 404 });
  }

  const newBalance = await adminAdjust(id, amount, session.user.id, description);
  return NextResponse.json({ ok: true, balance: newBalance });
}
