import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 20;

export default async function AdminResellersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const search = params.search || "";

  const where = search
    ? {
        OR: [
          { domain: { contains: search, mode: "insensitive" as const } },
          { siteName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [resellers, totalCount] = await Promise.all([
    prisma.reseller.findMany({
      where,
      orderBy: { domain: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.reseller.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">리셀러 관리</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            총 {totalCount.toLocaleString()}개
          </span>
          <Link
            href="/admin/resellers/new"
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 transition-colors"
          >
            리셀러 추가
          </Link>
        </div>
      </div>

      {/* Search */}
      <form className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="도메인 또는 사이트명으로 검색..."
            className="flex-1 rounded-lg border border-slate-600/40 bg-slate-800/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 transition-colors"
          >
            검색
          </button>
          {search && (
            <Link
              href="/admin/resellers"
              className="rounded-lg border border-slate-600/40 px-4 py-2 text-sm hover:bg-slate-100 transition-colors"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/20 bg-slate-800/30 text-left">
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">도메인</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">사이트명</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">로고</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">상태</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                Copyright
              </th>
            </tr>
          </thead>
          <tbody>
            {resellers.map((reseller) => (
              <tr
                key={reseller.id}
                className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-6 py-3">
                  <Link
                    href={`/admin/resellers/${reseller.id}`}
                    className="font-mono text-cyan-400 hover:text-cyan-300"
                  >
                    {reseller.domain}
                  </Link>
                </td>
                <td className="px-6 py-3 text-slate-400">
                  {reseller.siteName}
                </td>
                <td className="px-6 py-3 text-slate-500 text-xs truncate max-w-[200px]">
                  {reseller.logo || "-"}
                </td>
                <td className="px-6 py-3">
                  {reseller.isActive ? (
                    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      활성
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                      비활성
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-slate-500 text-xs truncate max-w-[200px]">
                  {reseller.copyright || "-"}
                </td>
              </tr>
            ))}
            {resellers.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-slate-400"
                >
                  {search
                    ? `"${search}" 검색 결과가 없습니다.`
                    : "등록된 리셀러가 없습니다."}
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
              href={`/admin/resellers?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
              href={`/admin/resellers?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
