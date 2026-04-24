import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Admin side of a single user's support thread.
 *
 *   GET  /api/admin/support/[userId]  → { user, thread, messages }
 *     Marks thread as read for admin (updates lastAdminReadAt).
 *
 *   POST /api/admin/support/[userId]  → append an ADMIN message
 *     Creates the thread if the user has never posted.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, id: true },
  });
  if (me?.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { adminId: me.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { userId } = await params;

  const [user, thread] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true },
    }),
    prisma.supportThread.findUnique({
      where: { userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  // Mark thread as read for admin (if thread exists).
  if (thread) {
    await prisma.supportThread.update({
      where: { id: thread.id },
      data: { lastAdminReadAt: new Date() },
    });
  }

  return NextResponse.json({
    user,
    thread: thread
      ? { id: thread.id, createdAt: thread.createdAt, updatedAt: thread.updatedAt }
      : null,
    messages:
      thread?.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt,
      })) ?? [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { userId } = await params;

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

  // Verify the target user exists before creating a thread.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  // Lazily create thread.
  let thread = await prisma.supportThread.findUnique({ where: { userId } });
  if (!thread) {
    thread = await prisma.supportThread.create({ data: { userId } });
  }

  const message = await prisma.supportMessage.create({
    data: {
      threadId: thread.id,
      sender: "ADMIN",
      adminUserId: a.adminId,
      body: text,
    },
  });

  await prisma.supportThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date(), lastAdminReadAt: new Date() },
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
