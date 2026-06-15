import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { classifySpam, AUTO_SPAM_THRESHOLD } from "@/lib/spam-classifier";

async function requireAdmin() {
  const session = await auth();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  return user?.role === "ADMIN" ? user : null;
}

type Action =
  | "spam"
  | "unspam"
  | "delete"
  | "restore"
  | "purge"
  | "markRead"
  | "markUnread"
  | "addTag"
  | "removeTag"
  | "reclassify";

interface Body {
  ids?: string[];
  action?: Action;
  tag?: string;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "too many ids" }, { status: 400 });
  }

  const action = body.action;
  const where = { id: { in: ids } };

  switch (action) {
    case "spam": {
      const r = await prisma.inboundEmail.updateMany({
        where,
        data: { isSpam: true },
      });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "unspam": {
      const r = await prisma.inboundEmail.updateMany({
        where,
        data: { isSpam: false },
      });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "delete": {
      const r = await prisma.inboundEmail.updateMany({
        where,
        data: { deletedAt: new Date() },
      });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "restore": {
      const r = await prisma.inboundEmail.updateMany({
        where,
        data: { deletedAt: null },
      });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "purge": {
      const r = await prisma.inboundEmail.deleteMany({ where });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "markRead": {
      const r = await prisma.inboundEmail.updateMany({
        where,
        data: { isRead: true },
      });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "markUnread": {
      const r = await prisma.inboundEmail.updateMany({
        where,
        data: { isRead: false },
      });
      return NextResponse.json({ ok: true, count: r.count });
    }
    case "addTag": {
      const tag = (body.tag || "").trim();
      if (!tag) {
        return NextResponse.json({ error: "tag required" }, { status: 400 });
      }
      if (tag.length > 40) {
        return NextResponse.json({ error: "tag too long" }, { status: 400 });
      }
      const rows = await prisma.inboundEmail.findMany({
        where,
        select: { id: true, tags: true },
      });
      let count = 0;
      for (const row of rows) {
        if (!row.tags.includes(tag)) {
          await prisma.inboundEmail.update({
            where: { id: row.id },
            data: { tags: [...row.tags, tag] },
          });
          count++;
        }
      }
      return NextResponse.json({ ok: true, count });
    }
    case "reclassify": {
      const rows = await prisma.inboundEmail.findMany({
        where,
        select: {
          id: true,
          fromEmail: true,
          fromName: true,
          toEmail: true,
          subject: true,
          text: true,
          html: true,
          isSpam: true,
        },
      });
      let scored = 0;
      let movedToSpam = 0;
      for (const row of rows) {
        const r = classifySpam({
          fromEmail: row.fromEmail,
          fromName: row.fromName,
          toEmail: row.toEmail,
          subject: row.subject,
          text: row.text,
          html: row.html,
        });
        const shouldSpam = r.score >= AUTO_SPAM_THRESHOLD;
        await prisma.inboundEmail.update({
          where: { id: row.id },
          data: {
            spamScore: r.score,
            spamReasons: r.reasons,
            // Only escalate to spam; do not unset existing spam mark on rescan.
            isSpam: row.isSpam || shouldSpam,
          },
        });
        scored++;
        if (shouldSpam && !row.isSpam) movedToSpam++;
      }
      return NextResponse.json({ ok: true, count: scored, movedToSpam });
    }
    case "removeTag": {
      const tag = (body.tag || "").trim();
      if (!tag) {
        return NextResponse.json({ error: "tag required" }, { status: 400 });
      }
      const rows = await prisma.inboundEmail.findMany({
        where,
        select: { id: true, tags: true },
      });
      let count = 0;
      for (const row of rows) {
        if (row.tags.includes(tag)) {
          await prisma.inboundEmail.update({
            where: { id: row.id },
            data: { tags: row.tags.filter((t) => t !== tag) },
          });
          count++;
        }
      }
      return NextResponse.json({ ok: true, count });
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
