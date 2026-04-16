import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Rate limit: 5 requests per 15 minutes per IP — prevents account enumeration
    // and email flood attacks. Returns 429 before any DB lookup.
    const ip = getClientIp(req);
    const { allowed, resetAt } = await checkRateLimit(
      `forgot-password:${ip}`,
      5,
      15 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(
              1,
              Math.ceil((resetAt.getTime() - Date.now()) / 1000)
            ).toString(),
          },
        }
      );
    }

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "이메일을 입력해주세요." },
        { status: 400 }
      );
    }

    // Always return success to avoid revealing user existence
    const successResponse = NextResponse.json({
      message:
        "해당 이메일로 비밀번호 재설정 링크를 보냈습니다. 이메일을 확인해 주세요.",
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return successResponse;
    }

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });

    // Build reset link
    const baseUrl =
      process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Send email (fire-and-forget)
    sendPasswordResetEmail(email, resetLink);

    return successResponse;
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
