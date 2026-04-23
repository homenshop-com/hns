import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/db";

/**
 * Resend Receiving (Inbound) webhook.
 *
 *   POST /api/email/inbound
 *
 * Verifies the Svix signature, stores the incoming email in DB, and forwards
 * the raw content to ADMIN_INBOX_FORWARD (homenshop.com@gmail.com).
 *
 * Env:
 *   RESEND_INBOUND_WEBHOOK_SECRET   Svix signing secret (format: whsec_...)
 *   RESEND_API_KEY                  to forward to the admin mailbox
 *   ADMIN_INBOX_FORWARD             admin gmail (default: homenshop.com@gmail.com)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_FORWARD = process.env.ADMIN_INBOX_FORWARD || "homenshop.com@gmail.com";
const FORWARD_FROM = "homeNshop Inbox <noreply@homenshop.com>";

function verifySvix(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  // Reject replay > 5min
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return false;
  }

  // secret is whsec_<base64>; hash with decoded bytes
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${ts}.${rawBody}`)
    .digest("base64");

  // Signature header format: "v1,<sig> v1,<sig2>"
  const sigs = sigHeader
    .split(" ")
    .map((p) => p.split(",")[1])
    .filter(Boolean);

  return sigs.some((s) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(s, "base64"),
        Buffer.from(expected, "base64")
      );
    } catch {
      return false;
    }
  });
}

type InboundAddress = { email?: string; name?: string } | string;

function addrEmail(a: InboundAddress | undefined): string {
  if (!a) return "";
  if (typeof a === "string") return a;
  return a.email || "";
}
function addrName(a: InboundAddress | undefined): string | undefined {
  if (!a || typeof a === "string") return undefined;
  return a.name || undefined;
}
function addrList(arr: InboundAddress[] | undefined): string {
  if (!arr?.length) return "";
  return arr.map(addrEmail).filter(Boolean).join(", ");
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[inbound] RESEND_INBOUND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifySvix(raw, req.headers, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: {
    type?: string;
    data?: {
      email_id?: string;
      id?: string;
      from?: InboundAddress;
      to?: InboundAddress[];
      cc?: InboundAddress[];
      subject?: string;
      html?: string;
      text?: string;
      headers?: unknown;
      attachments?: unknown;
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Resend sends events like "email.received" for inbound. Ignore anything else.
  if (payload.type && !payload.type.includes("received")) {
    return NextResponse.json({ ok: true, skipped: payload.type });
  }

  const d = payload.data || {};
  const fromEmail = addrEmail(d.from);
  const fromName = addrName(d.from);
  const toEmail = addrEmail(d.to?.[0]) || "help@homenshop.com";
  const cc = addrList(d.cc);

  const record = await prisma.inboundEmail.create({
    data: {
      resendId: d.email_id || d.id || null,
      fromEmail,
      fromName,
      toEmail,
      cc: cc || null,
      subject: d.subject || null,
      text: d.text || null,
      html: d.html || null,
      headers: (d.headers as object | undefined) ?? undefined,
      attachments: (d.attachments as object | undefined) ?? undefined,
    },
  });

  // Forward to admin gmail (fire-and-forget-ish, but await to log errors)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subject = `[${toEmail}] ${d.subject || "(no subject)"}`;
      const headerHtml = `
<div style="font-family:sans-serif;font-size:13px;color:#555;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:12px">
  <div><b>From:</b> ${escapeHtml(fromName ? `${fromName} <${fromEmail}>` : fromEmail)}</div>
  <div><b>To:</b> ${escapeHtml(toEmail)}</div>
  ${cc ? `<div><b>Cc:</b> ${escapeHtml(cc)}</div>` : ""}
  <div><b>Subject:</b> ${escapeHtml(d.subject || "")}</div>
</div>`;
      const body = d.html
        ? headerHtml + d.html
        : headerHtml + `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(d.text || "")}</pre>`;

      const { error } = await resend.emails.send({
        from: FORWARD_FROM,
        to: ADMIN_FORWARD,
        replyTo: fromEmail || undefined,
        subject,
        html: body,
        text: d.text || undefined,
      });
      if (error) {
        console.error("[inbound] forward failed:", error);
      } else {
        await prisma.inboundEmail.update({
          where: { id: record.id },
          data: { forwarded: true },
        });
      }
    } catch (err) {
      console.error("[inbound] forward threw:", err);
    }
  }

  return NextResponse.json({ ok: true, id: record.id });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
