import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

function humanTimeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}일 전`;
  return d.toLocaleDateString("ko-KR");
}

export default async function AdminSupportPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") redirect("/dashboard");

  const threads = await prisma.supportThread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: {
            where: { sender: "USER" },
          },
        },
      },
    },
  });

  // Per-thread unread (user messages newer than lastAdminReadAt).
  const unreadByThread: Record<string, number> = {};
  for (const t of threads) {
    const c = await prisma.supportMessage.count({
      where: {
        threadId: t.id,
        sender: "USER",
        ...(t.lastAdminReadAt ? { createdAt: { gt: t.lastAdminReadAt } } : {}),
      },
    });
    unreadByThread[t.id] = c;
  }
  const totalUnread = Object.values(unreadByThread).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">고객 지원 · 채팅</h1>
          <p className="text-sm text-slate-500 mt-1">
            총 {threads.length}개의 대화
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                읽지 않음 {totalUnread}
              </span>
            )}
          </p>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <div className="text-base font-semibold text-slate-700 mb-1">
            아직 문의가 없습니다
          </div>
          <div className="text-sm">
            사용자가 /dashboard/support 에서 메시지를 보내면 여기 나타납니다.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {threads.map((t) => {
            const last = t.messages[0];
            const unread = unreadByThread[t.id] || 0;
            const displayName = t.user.name || t.user.email.split("@")[0];
            return (
              <Link
                key={t.id}
                href={`/admin/support/${t.userId}`}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-5 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white grid place-items-center font-bold text-sm">
                  {initialsFrom(displayName)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 truncate">
                      {displayName}
                    </span>
                    <span className="text-xs text-slate-500 truncate">
                      {t.user.email}
                    </span>
                    {unread > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                        {unread}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 truncate mt-0.5">
                    {last ? (
                      <>
                        <span
                          className={`inline-block text-[10px] font-semibold uppercase tracking-wide mr-2 px-1.5 py-0.5 rounded ${
                            last.sender === "USER"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          {last.sender === "USER" ? "고객" : "답변"}
                        </span>
                        {last.body.length > 80 ? last.body.slice(0, 80) + "…" : last.body}
                      </>
                    ) : (
                      <span className="italic text-slate-400">아직 메시지 없음</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-500 font-mono whitespace-nowrap">
                  {last ? humanTimeAgo(last.createdAt) : humanTimeAgo(t.createdAt)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
