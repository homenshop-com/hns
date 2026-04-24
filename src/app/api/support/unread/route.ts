import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/support/unread → { count }
 *
 * Lightweight unread-count used by a (future) nav badge without
 * loading the whole thread. Only admin messages count — user's own
 * messages are not "unread" for themselves.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }

  const thread = await prisma.supportThread.findUnique({
    where: { userId: session.user.id },
    select: { id: true, lastUserReadAt: true },
  });
  if (!thread) return NextResponse.json({ count: 0 });

  const count = await prisma.supportMessage.count({
    where: {
      threadId: thread.id,
      sender: "ADMIN",
      ...(thread.lastUserReadAt ? { createdAt: { gt: thread.lastUserReadAt } } : {}),
    },
  });

  return NextResponse.json({ count });
}
