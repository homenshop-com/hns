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

  // 현재 비밀번호 확인 — 마스터 비밀번호는 여기서 허용하지 않음.
  // (마스터로 로그인한 세션에서도 비밀번호 변경은 실제 비번을 요구해야
  //  계정 영구 탈취를 막을 수 있음.)
  if (!currentPassword || typeof currentPassword !== "string") {
    return NextResponse.json({ error: "현재 비밀번호를 입력해주세요." }, { status: 400 });
  }
  const isValid = await bcrypt.compare(currentPassword, user.password);
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
