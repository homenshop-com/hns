import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendSms, buildOtpMessage, normalizePhoneDigits } from "@/lib/sms";

const OTP_TTL_MS = 3 * 60 * 1000; // 3 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // IP-scoped rate limit: 10 OTPs / hour from the same IP. SMS costs
    // money and abuse here is a direct billing attack, so the cap is
    // tighter than the registration limiter.
    const ipRl = await checkRateLimit(`phone-send:ip:${ip}`, 10, 60 * 60 * 1000);
    if (!ipRl.allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const { phone, purpose } = await req.json();
    const normalized = normalizePhoneDigits(phone ?? "");
    if (!normalized || normalized.length < 9 || normalized.length > 15) {
      return NextResponse.json(
        { error: "유효한 핸드폰 번호를 입력해주세요." },
        { status: 400 },
      );
    }

    // Phone-scoped rate limit: 5 OTPs / hour per number — protects users
    // against being spammed by someone typing their number into our form.
    const phoneRl = await checkRateLimit(
      `phone-send:phone:${normalized}`,
      5,
      60 * 60 * 1000,
    );
    if (!phoneRl.allowed) {
      return NextResponse.json(
        { error: "이 번호로 인증 요청이 너무 많습니다. 1시간 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const purposeStr =
      typeof purpose === "string" && purpose.length <= 32 ? purpose : "register";

    // Resend cooldown — reject if we issued an unverified code less than
    // 60s ago. Stops the user (or a bot) from rapid-firing send buttons.
    const recent = await prisma.phoneVerification.findFirst({
      where: { phone: normalized, purpose: purposeStr, verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000,
      );
      return NextResponse.json(
        { error: `${wait}초 후 다시 요청해주세요.` },
        { status: 429 },
      );
    }

    // Generate 6-digit code. Use crypto.randomInt for uniform distribution.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Invalidate any prior unverified codes for this (phone, purpose) so
    // only the latest code can succeed.
    await prisma.phoneVerification.deleteMany({
      where: { phone: normalized, purpose: purposeStr, verifiedAt: null },
    });

    await prisma.phoneVerification.create({
      data: {
        phone: normalized,
        code,
        purpose: purposeStr,
        expiresAt,
        ip,
      },
    });

    const result = await sendSms(normalized, buildOtpMessage(code));
    if (!result.ok) {
      return NextResponse.json(
        { error: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      ttlSeconds: OTP_TTL_MS / 1000,
      // testMode is only set when no NHN credentials are configured;
      // expose it so the UI can hint developers to check stderr.
      testMode: result.testMode === true,
    });
  } catch (err) {
    console.error("[phone/send]", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
