import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  const emails = await prisma.inboundEmail.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      fromEmail: true,
      fromName: true,
      toEmail: true,
      subject: true,
      forwarded: true,
      createdAt: true,
    },
  });

  const selected = id
    ? await prisma.inboundEmail.findUnique({ where: { id } })
    : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">이메일 수신함</h1>
      <div className="grid grid-cols-12 gap-4 bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="col-span-5 border-r border-slate-200 max-h-[70vh] overflow-auto">
          {emails.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              수신된 이메일이 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {emails.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/admin/inbox?id=${e.id}`}
                    className={`block px-4 py-3 hover:bg-slate-50 ${
                      selected?.id === e.id ? "bg-slate-100" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {e.fromName || e.fromEmail}
                      </div>
                      <div className="text-xs text-slate-400 shrink-0">
                        {fmtDate(e.createdAt)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      → {e.toEmail}
                    </div>
                    <div className="text-sm text-slate-700 truncate mt-0.5">
                      {e.subject || "(제목 없음)"}
                    </div>
                    {!e.forwarded && (
                      <div className="text-[10px] text-amber-600 mt-0.5">
                        전달 실패
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="col-span-7 p-6 max-h-[70vh] overflow-auto">
          {!selected ? (
            <div className="text-slate-400 text-sm">
              왼쪽에서 이메일을 선택하세요.
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">
                {selected.subject || "(제목 없음)"}
              </h2>
              <div className="text-sm text-slate-500 space-y-0.5 mb-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-slate-400">From: </span>
                  {selected.fromName
                    ? `${selected.fromName} <${selected.fromEmail}>`
                    : selected.fromEmail}
                </div>
                <div>
                  <span className="text-slate-400">To: </span>
                  {selected.toEmail}
                </div>
                {selected.cc && (
                  <div>
                    <span className="text-slate-400">Cc: </span>
                    {selected.cc}
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Date: </span>
                  {selected.createdAt.toLocaleString("ko-KR")}
                </div>
              </div>
              {selected.html ? (
                <iframe
                  title="email body"
                  srcDoc={selected.html}
                  sandbox=""
                  className="w-full min-h-[400px] border-0"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
                  {selected.text || "(본문 없음)"}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtDate(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}
