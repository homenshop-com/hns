import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 20;

export default async function AdminDomainsPage({
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
          {
            user: {
              email: { contains: search, mode: "insensitive" as const },
            },
          },
        ],
      }
    : {};

  const [domains, totalCount] = await Promise.all([
    prisma.domain.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, email: true, name: true } },
        site: { select: { id: true, name: true, shopId: true } },
      },
    }),
    prisma.domain.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">도메인 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}개
        </span>
      </div>

      {/* Search */}
      <form className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="도메인 또는 이메일로 검색..."
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
              href="/admin/domains"
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
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">소유자</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">계정명</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">상태</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">SSL</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">등록일</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((domain) => (
              <tr
                key={domain.id}
                className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-6 py-3">
                  <Link
                    href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-cyan-400 hover:text-cyan-300"
                  >
                    {domain.domain}
                  </Link>
                </td>
                <td className="px-6 py-3">
                  <div>{domain.user.name || "-"}</div>
                  <div className="text-xs text-slate-400">
                    {domain.user.email}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <Link href={`/admin/sites/${domain.site.id}`} className="text-cyan-400 hover:text-cyan-300">{domain.site.shopId || domain.site.name}</Link>
                </td>
                <td className="px-6 py-3">
                  <DomainStatusBadge status={domain.status} />
                </td>
                <td className="px-6 py-3">
                  {domain.sslEnabled ? (
                    <span className="inline-block rounded-md px-2 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-400/20">
                      활성
                    </span>
                  ) : (
                    <span className="inline-block rounded-md px-2 py-1 text-[11px] font-medium bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-400/20">
                      비활성
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {domain.createdAt.toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {domains.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-slate-400"
                >
                  {search
                    ? `"${search}" 검색 결과가 없습니다.`
                    : "등록된 도메인이 없습니다."}
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
              href={`/admin/domains?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
              href={`/admin/domains?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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

function DomainStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING:
      "bg-amber-500/10 text-amber-400",
    ACTIVE:
      "bg-emerald-500/10 text-emerald-400",
    EXPIRED: "bg-red-500/10 text-red-400",
  };

  const labels: Record<string, string> = {
    PENDING: "대기중",
    ACTIVE: "활성",
    EXPIRED: "만료",
  };

  return (
    <span
      className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${colors[status] || colors.PENDING}`}
    >
      {labels[status] || status}
    </span>
  );
}
