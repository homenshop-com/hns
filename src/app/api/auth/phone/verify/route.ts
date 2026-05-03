import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizePhoneDigits } from "@/lib/sms";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Coarse IP cap: 30 verify calls / 15 min from the same IP.
    const ipRl = await checkRateLimit(
      `phone-verify:ip:${ip}`,
      30,
      15 * 60 * 1000,
    );
    if (!ipRl.allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const { phone, code, purpose } = await req.json();
    const normalized = normalizePhoneDigits(phone ?? "");
    const codeStr = String(code ?? "").trim();
    const purposeStr =
      typeof purpose === "string" && purpose.length <= 32 ? purpose : "register";

    if (!normalized || !/^\d{6}$/.test(codeStr)) {
      return NextResponse.json(
        { error: "인증번호 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const row = await prisma.phoneVerification.findFirst({
      where: { phone: normalized, purpose: purposeStr, verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!row) {
      return NextResponse.json(
        { error: "인증번호를 먼저 발송해주세요." },
        { status: 400 },
      );
    }

    if (row.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "인증번호가 만료되었습니다. 다시 발송해주세요." },
        { status: 400 },
      );
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "시도 횟수를 초과했습니다. 인증번호를 다시 발송해주세요." },
        { status: 429 },
      );
    }

    if (row.code !== codeStr) {
      await prisma.phoneVerification.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      const left = MAX_ATTEMPTS - (row.attempts + 1);
      return NextResponse.json(
        {
          error:
            left > 0
              ? `인증번호가 일치하지 않습니다. (남은 시도: ${left}회)`
              : "시도 횟수를 초과했습니다. 인증번호를 다시 발송해주세요.",
        },
        { status: 400 },
      );
    }

    // Success — issue a single-use token bound to this verification.
    // The register API will accept this token + phone, then delete the row
    // so the proof cannot be replayed.
    const verifyToken = crypto.randomBytes(32).toString("hex");
    await prisma.phoneVerification.update({
      where: { id: row.id },
      data: { verifiedAt: new Date(), verifyToken },
    });

    return NextResponse.json({ ok: true, verifyToken });
  } catch (err) {
    console.error("[phone/verify]", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
