import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 3 resends per 15 minutes
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`resend-${ip}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, emailVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "이미 인증된 이메일입니다." }, { status: 400 });
  }

  // Delete old tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier: user.email },
  });

  // Create new token
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: user.email,
      token,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://homenshop.com";
  const verifyLink = `${baseUrl}/verify-email?token=${token}`;
  await sendVerificationEmail(user.email, verifyLink, user.name || undefined);

  return NextResponse.json({ ok: true });
}
