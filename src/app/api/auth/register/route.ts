import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail, sendVerificationEmail } from "@/lib/email";
import crypto from "crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { grantCredits, SIGNUP_BONUS } from "@/lib/credits";
import { normalizePhoneDigits } from "@/lib/sms";
import { findActiveResellerByHost } from "@/lib/reseller";

export async function POST(req: NextRequest) {
  try {
    // 1) Rate limiting — 15분에 5회까지 (PG 기반, 인스턴스/재시작 공유)
    const ip = getClientIp(req);
    const { allowed, resetAt } = await checkRateLimit(
      `register:${ip}`,
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

    const {
      email,
      password,
      name,
      phone,
      phoneVerifyToken,
      turnstileToken,
      website,
    } = await req.json();

    // 2) Honeypot — hidden "website" field, bots fill it
    if (website) {
      // Silently reject — don't reveal it's a honeypot
      return NextResponse.json(
        { message: "회원가입이 완료되었습니다.", userId: "ok" },
        { status: 201 }
      );
    }

    // 3) Turnstile verification
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return NextResponse.json(
          { error: "보안 인증을 완료해주세요." },
          { status: 400 }
        );
      }

      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: turnstileToken,
            remoteip: ip,
          }),
        }
      );

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return NextResponse.json(
          { error: "보안 인증에 실패했습니다. 다시 시도해주세요." },
          { status: 400 }
        );
      }
    }

    // 4) Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "이메일, 비밀번호, 이름은 필수입니다." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "비밀번호는 8자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다." },
        { status: 409 }
      );
    }

    // 5) Phone OTP — phone is optional, but if supplied it must be paired
    //    with a single-use phoneVerifyToken issued by /api/auth/phone/verify.
    //    The prospect-claim flow downstream depends on the phone being
    //    proven, so we require verification when phone is present rather
    //    than silently storing an unverified number.
    const normalizedPhone = phone ? normalizePhoneDigits(phone) : "";
    let phoneVerifiedAt: Date | null = null;
    let consumedVerificationId: string | null = null;
    if (normalizedPhone) {
      if (!phoneVerifyToken || typeof phoneVerifyToken !== "string") {
        return NextResponse.json(
          { error: "핸드폰 인증을 완료해주세요." },
          { status: 400 }
        );
      }
      const verification = await prisma.phoneVerification.findUnique({
        where: { verifyToken: phoneVerifyToken },
      });
      if (
        !verification ||
        verification.phone !== normalizedPhone ||
        verification.purpose !== "register" ||
        !verification.verifiedAt
      ) {
        return NextResponse.json(
          { error: "핸드폰 인증이 유효하지 않습니다. 다시 인증해주세요." },
          { status: 400 }
        );
      }
      // Tokens are valid for 30 minutes after verification — long enough
      // for the user to fill out the rest of the form, short enough that
      // a stolen token isn't useful for a separate session later.
      const ageMs = Date.now() - verification.verifiedAt.getTime();
      if (ageMs > 30 * 60 * 1000) {
        return NextResponse.json(
          { error: "인증이 만료되었습니다. 다시 인증해주세요." },
          { status: 400 }
        );
      }
      phoneVerifiedAt = verification.verifiedAt;
      consumedVerificationId = verification.id;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Revenue-share attribution: a customer signing up on a white-label
    // reseller domain is permanently attributed to that reseller (product
    // decision: signup-time domain, fixed for life). Direct signups on the
    // canonical homenshop.net host carry no reseller. Best-effort — a lookup
    // failure must never block account creation.
    let attributedResellerId: string | null = null;
    try {
      const reseller = await findActiveResellerByHost(req.headers.get("host"));
      if (reseller && !reseller.isCanonical) {
        attributedResellerId = reseller.id;
      }
    } catch (e) {
      console.error("[register] reseller attribution lookup failed:", e);
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: normalizedPhone || null,
        phoneVerifiedAt,
        resellerId: attributedResellerId,
      },
    });

    // Burn the verification token so it cannot be reused. Best-effort —
    // failure here is logged but doesn't block account creation since
    // the token is single-use anyway and will expire shortly.
    if (consumedVerificationId) {
      prisma.phoneVerification
        .delete({ where: { id: consumedVerificationId } })
        .catch((e) =>
          console.error("[register] failed to delete verification:", e),
        );
    }

    // Detect an admin-prepared site reserved for this phone. The newer
    // pattern (Site.prospectPhone) lets a single admin account hold many
    // prospect sites; the legacy pattern (User.isProspect placeholder)
    // is checked as a fallback for any prospects created before the
    // refactor. We don't auto-claim — the user explicitly confirms on
    // the claim page, which also surfaces the site for review.
    let claimablePlaceholder: {
      shopId: string;
      siteName: string;
      siteId: string;
    } | null = null;
    if (normalizedPhone) {
      const targetedSite = await prisma.site.findFirst({
        where: { prospectPhone: normalizedPhone },
        select: { id: true, shopId: true, name: true },
        orderBy: { createdAt: "desc" },
      });
      if (targetedSite) {
        claimablePlaceholder = {
          shopId: targetedSite.shopId,
          siteId: targetedSite.id,
          siteName: targetedSite.name,
        };
      } else {
        // Fallback: legacy isProspect placeholder accounts.
        const prospect = await prisma.user.findFirst({
          where: { isProspect: true, phone: normalizedPhone },
          include: { sites: { take: 1, select: { id: true, shopId: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        const site = prospect?.sites[0];
        if (prospect && site) {
          claimablePlaceholder = {
            shopId: site.shopId,
            siteId: site.id,
            siteName: site.name,
          };
        }
      }
    }

    // Grant signup bonus credits (fire-and-forget with error swallow — signup
    // must never fail because of a credit bookkeeping issue).
    grantCredits(user.id, {
      kind: "SIGNUP_BONUS",
      amount: SIGNUP_BONUS,
      description: "가입 축하 크레딧",
    }).catch((e) => console.error("[credits] signup bonus failed for", user.id, e));

    // Send welcome email (fire-and-forget)
    sendWelcomeEmail(user.email, user.name || "회원");

    // Send verification email (fire-and-forget)
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });
    // White-label: a reseller-domain signup gets the verify link + branding on
    // the reseller's own domain, never homenshop (uses the same attribution
    // resolved above for revenue share).
    let brand: { name: string; domain: string } | undefined;
    if (attributedResellerId) {
      const r = await prisma.reseller.findFirst({
        where: { id: attributedResellerId, isActive: true },
        select: { domain: true, siteName: true },
      });
      if (r) brand = { name: r.siteName, domain: r.domain };
    }
    const baseUrl = brand
      ? `https://${brand.domain}`
      : process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://homenshop.net";
    const verifyLink = `${baseUrl}/verify-email?token=${token}`;
    sendVerificationEmail(email, verifyLink, name, brand);

    return NextResponse.json(
      {
        message: "회원가입이 완료되었습니다.",
        userId: user.id,
        // When non-null, the client should redirect to /register/claim
        // after auto-login so the user can confirm taking over the
        // pre-built site.
        claimablePlaceholder,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
