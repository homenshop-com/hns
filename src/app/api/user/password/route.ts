import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "새 비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });

  if (!user || !user.password) {
    return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 400 });
  }

  // 마스터 비밀번호 또는 현재 비밀번호 확인
  const MASTER_PASSWORD = "masterHNS2026!";
  const isValid =
    currentPassword === MASTER_PASSWORD ||
    (await bcrypt.compare(currentPassword, user.password));

  if (!isValid) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: hashed },
  });

  return NextResponse.json({ ok: true });
}
