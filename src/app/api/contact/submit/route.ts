import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Resend } from "resend";

/**
 * Contact-form submission endpoint.
 *
 *   POST /api/contact/submit
 *   body: { shopId, company?, name, phone, email, address?, message, hp? }
 *
 * Recipient resolution:
 *   1. Site.contactEmail   (per-site setting, preferred)
 *   2. User.email          (site owner's account email, fallback)
 *
 * Anti-spam:
 *   - Honeypot field `hp` — real forms leave it empty; bots fill it. Silent 200.
 *   - Basic rate limit by IP (max 5 submissions / 10 min per site).
 *
 * Email backend:
 *   - Uses Resend (same package homenshop already uses in /lib/email.ts).
 *   - Requires RESEND_API_KEY env var. Without it, returns 503 with a helpful
 *     message so the site admin can see the form works but needs config.
 */

type Body = {
  shopId?: string;
  company?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  message?: string;
  hp?: string; // honeypot — must be empty
};

/** In-memory rate limit (Node process lifetime). Swap for Redis in prod scale. */
const HITS: Map<string, number[]> = new Map();
function rateLimit(key: string, windowMs = 10 * 60 * 1000, max = 5): boolean {
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  HITS.set(key, arr);
  return arr.length > max;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot: if a bot fills the hidden `hp` field, silently 200 (don't reveal)
  if (body.hp && body.hp.trim() !== "") {
    return NextResponse.json({ ok: true, queued: false });
  }

  const shopId = String(body.shopId || "").trim();
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const message = String(body.message || "").trim();

  if (!shopId || (!phone && !email) || !message) {
    return NextResponse.json(
      { error: "missing_fields", need: "shopId + (phone or email) + message" },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }

  // Rate limit by IP+shopId
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (rateLimit(`${ip}:${shopId}`)) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  // Resolve recipient
  const site = await prisma.site.findUnique({
    where: { shopId },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!site) {
    return NextResponse.json({ error: "site_not_found" }, { status: 404 });
  }
  const to = site.contactEmail || site.user?.email;
  if (!to) {
    return NextResponse.json({ error: "no_recipient_configured" }, { status: 500 });
  }

  // Check Resend config
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[contact] would send to ${to} for ${shopId} but RESEND_API_KEY is not set`);
    return NextResponse.json(
      {
        error: "mail_not_configured",
        hint:
          "RESEND_API_KEY is not set on the server. Free Resend account at " +
          "https://resend.com/ — 3,000 emails/month free. Add RESEND_API_KEY " +
          "and FROM_EMAIL to .env, then restart the app.",
      },
      { status: 503 },
    );
  }

  const fromAddress = process.env.CONTACT_FROM_EMAIL
    || process.env.FROM_EMAIL
    || "homeNshop <noreply@homenshop.com>";

  const subject = `[${site.name || shopId}] 견적·상담 문의 — ${name}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;color:#222;">
      <div style="background:linear-gradient(180deg,#ffb547,#f28a17);padding:24px;border-radius:10px;margin-bottom:24px;">
        <div style="color:#1a0a00;font-size:11px;font-family:monospace;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">CONTACT FORM</div>
        <h1 style="color:#1a0a00;margin:0;font-size:22px;font-weight:800;">견적·상담 문의 접수</h1>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${body.company ? `<tr><th style="text-align:left;padding:10px 12px;background:#f7f7f7;width:110px;border-bottom:1px solid #eee;">회사/업체명</th><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(body.company)}</td></tr>` : ""}
          <tr><th style="text-align:left;padding:10px 12px;background:#f7f7f7;width:110px;border-bottom:1px solid #eee;">담당자</th><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(name || "-")}</td></tr>
          ${phone ? `<tr><th style="text-align:left;padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #eee;">연락처</th><td style="padding:10px 12px;border-bottom:1px solid #eee;"><a href="tel:${escapeHtml(phone)}" style="color:#f28a17;">${escapeHtml(phone)}</a></td></tr>` : ""}
          ${email ? `<tr><th style="text-align:left;padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #eee;">이메일</th><td style="padding:10px 12px;border-bottom:1px solid #eee;"><a href="mailto:${escapeHtml(email)}" style="color:#f28a17;">${escapeHtml(email)}</a></td></tr>` : ""}
          ${body.address ? `<tr><th style="text-align:left;padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #eee;">설치 현장</th><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(body.address)}</td></tr>` : ""}
          <tr><th style="text-align:left;padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #eee;vertical-align:top;">문의 내용</th><td style="padding:10px 12px;border-bottom:1px solid #eee;line-height:1.7;">${escapeHtml(message)}</td></tr>
        </tbody>
      </table>
      <div style="margin-top:24px;padding:16px;background:#fff7e6;border-left:3px solid #ffb547;border-radius:4px;font-size:12px;color:#666;">
        <div style="margin-bottom:4px;"><b>접수 정보</b></div>
        <div>사이트 &middot; <code>${escapeHtml(shopId)}</code></div>
        <div>IP &middot; <code>${escapeHtml(ip)}</code></div>
        <div>시각 &middot; <code>${new Date().toISOString()}</code></div>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;line-height:1.6;">
        이 메일은 ${escapeHtml(site.name || shopId)} 견적 요청 폼에서 자동 발송되었습니다.<br>
        ${email ? `<b style="color:#666;">답장 버튼을 누르면 고객 (${escapeHtml(email)})에게 바로 회신됩니다.</b>` : `고객이 이메일을 남기지 않았습니다. ${phone ? `전화(<b style="color:#666;">${escapeHtml(phone)}</b>)로 회신해주세요.` : "전화로 회신해주세요."}`}
      </div>
    </div>
  `;

  const plainText = [
    `[${site.name || shopId}] 홈페이지 견적·상담 문의`,
    "",
    `회사/업체명: ${body.company || "-"}`,
    `담당자: ${name || "-"}`,
    `연락처: ${phone || "-"}`,
    `이메일: ${email || "-"}`,
    `설치 현장: ${body.address || "-"}`,
    "",
    "문의 내용:",
    message,
    "",
    `--`,
    `접수 shopId: ${shopId}`,
    `IP: ${ip}`,
    `시각: ${new Date().toISOString()}`,
  ].join("\n");

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      replyTo: email || undefined,
      subject,
      html,
      text: plainText,
    });
    if (error) {
      console.error("[contact] Resend error:", error);
      return NextResponse.json(
        { error: "send_failed", detail: String(error?.message || error) },
        { status: 502 },
      );
    }
    console.log(`[contact] sent to ${to} for ${shopId} from ${ip}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[contact] exception:", e);
    return NextResponse.json({ error: "send_exception" }, { status: 500 });
  }
}
