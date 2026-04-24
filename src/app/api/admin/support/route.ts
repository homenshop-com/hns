import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/support
 *   → { threads: [{userId, email, name, lastMessage, unread, updatedAt}] }
 *
 * Lists every support thread, newest-first, with enough data to render
 * the admin inbox. `unread` counts user messages newer than
 * lastAdminReadAt — i.e., messages the admin hasn't seen yet.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const threads = await prisma.supportThread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Compute unread per thread (user messages newer than lastAdminReadAt).
  const threadIds = threads.map((t) => t.id);
  const unreadByThread: Record<string, number> = {};
  if (threadIds.length > 0) {
    const unread = await prisma.supportMessage.groupBy({
      by: ["threadId"],
      _count: { _all: true },
      where: {
        threadId: { in: threadIds },
        sender: "USER",
        OR: threads.map((t) =>
          t.lastAdminReadAt
            ? { threadId: t.id, createdAt: { gt: t.lastAdminReadAt } }
            : { threadId: t.id },
        ),
      },
    });
    for (const u of unread) unreadByThread[u.threadId] = u._count._all;
  }

  return NextResponse.json({
    threads: threads.map((t) => ({
      threadId: t.id,
      userId: t.userId,
      email: t.user.email,
      name: t.user.name,
      updatedAt: t.updatedAt,
      lastMessage: t.messages[0]
        ? {
            sender: t.messages[0].sender,
            body: t.messages[0].body,
            createdAt: t.messages[0].createdAt,
          }
        : null,
      unread: unreadByThread[t.id] || 0,
    })),
  });
}
