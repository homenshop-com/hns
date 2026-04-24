import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/admin/support/broadcast
 *   body: { userIds: string[], body: string }
 *   → { sent: number }
 *
 * Sends the SAME admin message to each target user's support thread.
 * Lazily creates any thread that doesn't exist yet. Each recipient gets
 * their own message row (separate chats), so this is fan-out, not a
 * shared group chat.
 *
 * Guards:
 *   · ADMIN only
 *   · Max 200 recipients per call (sanity limit)
 *   · Non-empty body, max 4000 chars
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => ({}));
  const userIds: string[] = Array.isArray(json.userIds) ? json.userIds.filter((x: unknown) => typeof x === "string") : [];
  const body: string = typeof json.body === "string" ? json.body.trim() : "";

  if (userIds.length === 0) {
    return NextResponse.json({ error: "수신자를 선택하세요." }, { status: 400 });
  }
  if (userIds.length > 200) {
    return NextResponse.json({ error: "한 번에 최대 200명까지만 전송할 수 있습니다." }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: "메시지를 입력하세요." }, { status: 400 });
  }
  if (body.length > 4000) {
    return NextResponse.json({ error: "메시지는 4,000자 이하로 입력하세요." }, { status: 400 });
  }

  // Verify the users exist (skip any id that doesn't).
  const existing = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  const validIds = existing.map((u) => u.id);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "유효한 수신자가 없습니다." }, { status: 404 });
  }

  // Ensure a thread exists for each valid user, then bulk-insert messages.
  // Done sequentially to keep the logic simple; at 200 max, this is fine.
  let sent = 0;
  const now = new Date();
  for (const userId of validIds) {
    let thread = await prisma.supportThread.findUnique({ where: { userId } });
    if (!thread) {
      thread = await prisma.supportThread.create({ data: { userId } });
    }
    await prisma.supportMessage.create({
      data: {
        threadId: thread.id,
        sender: "ADMIN",
        adminUserId: me.id,
        body,
      },
    });
    await prisma.supportThread.update({
      where: { id: thread.id },
      data: { updatedAt: now, lastAdminReadAt: now },
    });
    sent += 1;
  }

  console.log(`[admin/support/broadcast] sent to ${sent} users by admin=${me.id}`);
  return NextResponse.json({ sent });
}
