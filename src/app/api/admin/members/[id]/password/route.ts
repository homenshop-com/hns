import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getAdminAccess } from "@/lib/admin-access";

/**
 * Admin password reset for a member (including ADMIN accounts).
 *
 * FULL-ADMIN ONLY. A password reset is effectively an account takeover, so
 * reseller operators are blocked outright — they may never set another user's
 * password (and certainly not an ADMIN's). Mirrors the bcrypt policy used by
 * /api/auth/register and /api/auth/reset-password (min 8 chars, cost 12).
 *
 * Sessions are JWT-based, so an existing token stays valid until it expires —
 * this only changes the credential used for the next sign-in.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (access.kind !== "admin") {
    return NextResponse.json(
      { error: "비밀번호 변경 권한이 없습니다." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "비밀번호는 8자 이상이어야 합니다." },
      { status: 400 }
    );
  }
  if (password.length > 200) {
    return NextResponse.json(
      { error: "비밀번호가 너무 깁니다." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "회원을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: target.id },
    data: { password: hashedPassword },
  });

  // Audit trail (fire-and-forget console — never blocks the response).
  console.warn(
    `[SECURITY] Admin ${access.userId} reset password for ${target.email} (id=${target.id})`
  );

  return NextResponse.json({ ok: true });
}
