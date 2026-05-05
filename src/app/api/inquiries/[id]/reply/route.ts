import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Resend } from "resend";

/**
 * POST /api/inquiries/[id]/reply
 *
 * Sends a reply to the inquiry's customer through the system's outbound
 * mailer (Resend). The visible "From" name is the site/admin's name and
 * the `replyTo` header is set to the admin's email — that way:
 *   1. Customer sees a branded sender ("YoungBin Technology <noreply@…>")
 *   2. When they hit "Reply" in their mail client, the response goes
 *      directly to the site admin's actual inbox
 *
 * The reply body, subject, sender id, and timestamp are persisted on the
 * Inquiry row, and status flips to REPLIED on success.
 */

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const inq = await prisma.inquiry.findUnique({
    where: { id },
    select: {
      id: true,
      siteId: true,
      email: true,
      name: true,
      productName: true,
      message: true,
      site: {
        select: {
          userId: true,
          name: true,
          shopId: true,
          contactEmail: true,
          user: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!inq || inq.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!inq.email) {
    return NextResponse.json(
      { error: "no_recipient", detail: "이 문의는 이메일이 없어 시스템 회신 불가합니다. 전화로 회신하세요." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    body?: string;
  };
  const subject = String(body.subject || "").trim();
  const replyBody = String(body.body || "").trim();
  if (!subject || !replyBody) {
    return NextResponse.json({ error: "subject and body required" }, { status: 400 });
  }
  if (subject.length > 200) {
    return NextResponse.json({ error: "subject too long" }, { status: 400 });
  }
  if (replyBody.length > 10000) {
    return NextResponse.json({ error: "body too long" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      {
        error: "mail_not_configured",
        hint: "RESEND_API_KEY is not set on the server.",
      },
      { status: 503 },
    );
  }

  // The verified sender domain (must be configured in Resend). The admin's
  // actual email goes in `replyTo` so customer replies route correctly.
  const fromAddress = process.env.CONTACT_FROM_EMAIL
    || process.env.FROM_EMAIL
    || "homeNshop <noreply@homenshop.com>";

  // Build a friendlier sender display: "{Site Name} <noreply@…>"
  // Falls back to fromAddress as-is if it already contains an angle-bracket form.
  let displayFrom = fromAddress;
  if (!fromAddress.includes("<") && inq.site.name) {
    displayFrom = `${inq.site.name} <${fromAddress}>`;
  } else if (fromAddress.includes("<") && inq.site.name) {
    // Replace the display name portion before the angle bracket with site name.
    displayFrom = fromAddress.replace(/^[^<]+/, `${inq.site.name} `);
  }

  const adminEmail = inq.site.contactEmail || inq.site.user?.email;
  const adminName = inq.site.user?.name || inq.site.name || "";

  // Quote the original message at the bottom for context.
  const originalQuote = inq.message
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a1a2e;line-height:1.6;">
      <div style="font-size:11px;font-family:monospace;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">REPLY FROM ${escapeHtml(inq.site.name || inq.site.shopId)}</div>
      ${inq.name ? `<div style="margin-bottom:16px;color:#475569;">Hi ${escapeHtml(inq.name)},</div>` : ""}
      <div style="font-size:15px;color:#1a1a2e;white-space:pre-wrap;">${escapeHtml(replyBody)}</div>
      ${adminName || adminEmail ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#64748b;">
        ${adminName ? `<div style="color:#1a1a2e;font-weight:600;margin-bottom:2px;">${escapeHtml(adminName)}</div>` : ""}
        ${inq.site.name ? `<div>${escapeHtml(inq.site.name)}</div>` : ""}
        ${adminEmail ? `<div><a href="mailto:${escapeHtml(adminEmail)}" style="color:#0a2540;">${escapeHtml(adminEmail)}</a></div>` : ""}
      </div>` : ""}
      <div style="margin-top:24px;padding:16px;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:4px;font-size:12px;color:#64748b;line-height:1.6;">
        <div style="font-size:10px;font-family:monospace;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;">— Original inquiry${inq.productName ? ` · ${escapeHtml(inq.productName)}` : ""}</div>
        <div style="white-space:pre-wrap;color:#475569;">${escapeHtml(inq.message)}</div>
      </div>
    </div>
  `;

  const plainText = [
    inq.name ? `Hi ${inq.name},` : "",
    inq.name ? "" : null,
    replyBody,
    "",
    "--",
    adminName || "",
    inq.site.name || "",
    adminEmail || "",
    "",
    "",
    `--- Original inquiry${inq.productName ? ` · ${inq.productName}` : ""} ---`,
    originalQuote,
  ].filter((l) => l !== null).join("\n");

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: displayFrom,
      to: inq.email,
      replyTo: adminEmail || undefined,
      subject,
      html,
      text: plainText,
    });
    if (error) {
      console.error("[inquiry-reply] Resend error:", error);
      return NextResponse.json(
        { error: "send_failed", detail: String(error?.message || error) },
        { status: 502 },
      );
    }
  } catch (e) {
    console.error("[inquiry-reply] exception:", e);
    return NextResponse.json({ error: "send_exception" }, { status: 500 });
  }

  await prisma.inquiry.update({
    where: { id },
    data: {
      replySubject: subject,
      replyBody,
      repliedAt: new Date(),
      repliedBy: session.user.id,
      status: "REPLIED",
    },
  });

  console.log(`[inquiry-reply] ${id} → ${inq.email} (admin ${session.user.id})`);
  return NextResponse.json({ ok: true });
}
