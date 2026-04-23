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

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Resend sends events like "email.received" for inbound. Ignore anything else.
  if (payload.type && !payload.type.includes("received")) {
    return NextResponse.json({ ok: true, skipped: payload.type });
  }

  const d: Record<string, unknown> = (payload.data as Record<string, unknown>) || {};

  // Log payload shape for diagnostics — Resend's inbound format isn't fully documented
  console.log("[inbound] data keys:", Object.keys(d));
  const preview: Record<string, unknown> = {};
  for (const k of Object.keys(d)) {
    const v = (d as Record<string, unknown>)[k];
    preview[k] =
      typeof v === "string"
        ? v.length > 80
          ? v.slice(0, 80) + `…(${v.length})`
          : v
        : Array.isArray(v)
          ? `array(${v.length})`
          : typeof v === "object" && v !== null
            ? `object(${Object.keys(v).join(",")})`
            : v;
  }
  console.log("[inbound] preview:", JSON.stringify(preview));

  // Pick text/html from multiple possible field names
  const pickStr = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return undefined;
  };
  let text = pickStr("text", "body_text", "bodyText", "textBody", "plain");
  let html = pickStr("html", "body_html", "bodyHtml", "htmlBody");

  // Resend webhook only sends metadata — fetch full body via API if needed.
  const emailId =
    (typeof d.email_id === "string" ? d.email_id : undefined) ||
    (typeof d.id === "string" ? d.id : undefined);
  const fetchKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
  if (!text && !html && emailId && fetchKey) {
    try {
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${fetchKey}` },
      });
      if (r.ok) {
        const full = (await r.json()) as Record<string, unknown>;
        if (typeof full.text === "string") text = full.text;
        if (typeof full.html === "string") html = full.html;
        console.log(
          "[inbound] fetched body:",
          `text=${text?.length ?? 0}`,
          `html=${html?.length ?? 0}`
        );
      } else {
        console.error(
          "[inbound] fetch body failed:",
          r.status,
          (await r.text()).slice(0, 200)
        );
      }
    } catch (e) {
      console.error("[inbound] fetch body threw:", e);
    }
  }

  // from/to may be string, object, or array
  const pickFirstAddr = (keys: string[]): InboundAddress | undefined => {
    for (const k of keys) {
      const v = d[k];
      if (!v) continue;
      if (typeof v === "string") return v;
      if (Array.isArray(v) && v.length > 0) return v[0] as InboundAddress;
      if (typeof v === "object") return v as InboundAddress;
    }
    return undefined;
  };
  const fromRaw = pickFirstAddr(["from", "fromAddress", "sender"]);
  const fromEmailParsed = parseEmailAddr(addrEmail(fromRaw) || (typeof fromRaw === "string" ? fromRaw : ""));
  const fromEmail = fromEmailParsed.email;
  const fromName = addrName(fromRaw) ?? fromEmailParsed.name;

  const toRaw = pickFirstAddr(["to", "toAddress", "recipient"]);
  const toEmailParsed = parseEmailAddr(addrEmail(toRaw) || (typeof toRaw === "string" ? toRaw : ""));
  const toEmail = toEmailParsed.email || "help@homenshop.com";

  const ccVal = d.cc;
  const cc = Array.isArray(ccVal)
    ? (ccVal as InboundAddress[]).map(addrEmail).filter(Boolean).join(", ")
    : typeof ccVal === "string"
      ? ccVal
      : "";

  const record = await prisma.inboundEmail.create({
    data: {
      resendId:
        (typeof d.email_id === "string" ? d.email_id : undefined) ||
        (typeof d.id === "string" ? d.id : undefined) ||
        null,
      fromEmail,
      fromName,
      toEmail,
      cc: cc || null,
      subject: typeof d.subject === "string" ? d.subject : null,
      text: text ?? null,
      html: html ?? null,
      headers: (d.headers as object | undefined) ?? undefined,
      attachments: (d.attachments as object | undefined) ?? undefined,
    },
  });

  // Forward to admin gmail (fire-and-forget-ish, but await to log errors)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subjectStr = typeof d.subject === "string" ? d.subject : "";
      const subject = `[${toEmail}] ${subjectStr || "(no subject)"}`;
      const headerHtml = `
<div style="font-family:sans-serif;font-size:13px;color:#555;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:12px">
  <div><b>From:</b> ${escapeHtml(fromName ? `${fromName} <${fromEmail}>` : fromEmail)}</div>
  <div><b>To:</b> ${escapeHtml(toEmail)}</div>
  ${cc ? `<div><b>Cc:</b> ${escapeHtml(cc)}</div>` : ""}
  <div><b>Subject:</b> ${escapeHtml(subjectStr)}</div>
</div>`;
      const body = html
        ? headerHtml + html
        : headerHtml + `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text || "")}</pre>`;

      const { error } = await resend.emails.send({
        from: FORWARD_FROM,
        to: ADMIN_FORWARD,
        replyTo: fromEmail || undefined,
        subject,
        html: body,
        text: text || undefined,
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

/** Parse "Name <email@host>" or bare "email@host" into {name?, email}. */
function parseEmailAddr(input: string): { email: string; name?: string } {
  const s = (input || "").trim();
  if (!s) return { email: "" };
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].replace(/^"|"$/g, "").trim();
    return { email: m[2].trim(), name: name || undefined };
  }
  return { email: s };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
