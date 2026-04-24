import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Support chat — user-facing endpoints.
 *
 *   GET  /api/support/messages  → { thread, messages, unreadFromAdmin }
 *   POST /api/support/messages  → append a USER message
 *
 * Thread is lazy-created on first POST. Opening via GET marks all
 * admin messages as read (updates thread.lastUserReadAt).
 */

async function loadOrCreateThread(userId: string) {
  let thread = await prisma.supportThread.findUnique({ where: { userId } });
  if (!thread) {
    thread = await prisma.supportThread.create({ data: { userId } });
  }
  return thread;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = await prisma.supportThread.findUnique({
    where: { userId: session.user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  // No thread yet: return an empty shape.
  if (!thread) {
    return NextResponse.json({
      thread: null,
      messages: [],
      unreadFromAdmin: 0,
    });
  }

  // Count admin messages newer than user's last-read before we update it.
  const unreadFromAdmin = thread.lastUserReadAt
    ? thread.messages.filter(
        (m) => m.sender === "ADMIN" && m.createdAt > thread.lastUserReadAt!,
      ).length
    : thread.messages.filter((m) => m.sender === "ADMIN").length;

  // Mark thread as read for the user.
  await prisma.supportThread.update({
    where: { id: thread.id },
    data: { lastUserReadAt: new Date() },
  });

  return NextResponse.json({
    thread: { id: thread.id, createdAt: thread.createdAt, updatedAt: thread.updatedAt },
    messages: thread.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt,
    })),
    unreadFromAdmin,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "메시지를 입력하세요." }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "메시지는 4,000자 이하로 입력하세요." },
      { status: 400 },
    );
  }

  const thread = await loadOrCreateThread(session.user.id);

  const message = await prisma.supportMessage.create({
    data: {
      threadId: thread.id,
      sender: "USER",
      body: text,
    },
  });

  // Bump thread updatedAt so admin list sorts correctly.
  await prisma.supportThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({
    message: {
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt,
    },
  });
}

/**
 * Lightweight counter for the sidebar badge. Returns the number of
 * unread admin messages in the user's thread (0 if no thread yet).
 *
 * GET /api/support/messages?head=1
 * (But next's route handler can't overload a single path easily, so
 * we expose this via a sibling file below — see /api/support/unread.)
 */
