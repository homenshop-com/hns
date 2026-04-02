import { prisma } from "@/lib/db";
import Link from "next/link";

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  board: "게시판",
  notice: "공지사항",
  faq: "FAQ",
};

export default async function AdminBoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const [boards, totalCount] = await Promise.all([
    prisma.board.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        site: { select: { name: true } },
        _count: { select: { posts: true } },
      },
    }),
    prisma.board.count(),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">게시판 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}개
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/20 bg-slate-800/30 text-left">
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">게시판명</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">사이트</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">유형</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-right">
                게시글 수
              </th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">생성일</th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr
                key={board.id}
                className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-6 py-3 font-medium text-slate-200">{board.title}</td>
                <td className="px-6 py-3 text-slate-400">
                  {board.site.name}
                </td>
                <td className="px-6 py-3">
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
                    {TYPE_LABELS[board.type] ?? board.type}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  {board._count.posts}
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {board.createdAt.toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {boards.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-slate-400"
                >
                  등록된 게시판이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/boards?page=${page - 1}`}
              className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              이전
            </Link>
          )}

          <span className="text-sm text-slate-500">
            {page} / {totalPages} 페이지
          </span>

          {page < totalPages && (
            <Link
              href={`/admin/boards?page=${page + 1}`}
              className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
