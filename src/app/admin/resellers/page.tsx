import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";
import { requireFullAdmin } from "@/lib/admin-access";

const PAGE_SIZE = 20;

export default async function AdminResellersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  await requireFullAdmin();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const search = params.search || "";
  // 활성/비활성 필터: "" = 전체, "active", "inactive"
  const status = params.status === "active" || params.status === "inactive" ? params.status : "";

  // Shared search predicate; the status tab adds an isActive constraint on top.
  const searchWhere = search
    ? {
        OR: [
          { domain: { contains: search, mode: "insensitive" as const } },
          { siteName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
  const where = {
    ...searchWhere,
    ...(status === "active"
      ? { isActive: true }
      : status === "inactive"
        ? { isActive: false }
        : {}),
  };

  const [resellers, totalCount, countAll, countActive] = await Promise.all([
    prisma.reseller.findMany({
      where,
      orderBy: { domain: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { owner: { select: { email: true, name: true } } },
    }),
    prisma.reseller.count({ where }),
    // Tab counts respect the active search so the numbers match the results.
    prisma.reseller.count({ where: searchWhere }),
    prisma.reseller.count({ where: { ...searchWhere, isActive: true } }),
  ]);

  const counts = { all: countAll, active: countActive, inactive: countAll - countActive };
  const statusTabs = [
    { key: "", label: "전체", count: counts.all },
    { key: "active", label: "활성", count: counts.active },
    { key: "inactive", label: "비활성", count: counts.inactive },
  ];

  // Preserve search + status across tab clicks and pagination.
  const buildQuery = (overrides: { status?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextPage = overrides.page ?? page;
    if (nextPage > 1) sp.set("page", String(nextPage));
    if (search) sp.set("search", search);
    if (nextStatus) sp.set("status", nextStatus);
    const qs = sp.toString();
    return qs ? `/admin/resellers?${qs}` : "/admin/resellers";
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">리셀러 관리</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            총 {totalCount.toLocaleString()}개
          </span>
          <Link
            href="/admin/resellers/new"
            className="rounded-lg bg-[#3182f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b64da] transition-colors"
          >
            리셀러 추가
          </Link>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {statusTabs.map((t) => (
          <Link
            key={t.key || "all"}
            href={buildQuery({ status: t.key, page: 1 })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              status === t.key
                ? "bg-[#3182f6] text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label} ({t.count.toLocaleString()})
          </Link>
        ))}
      </div>

      {/* Search */}
      <form className="mb-6">
        <input type="hidden" name="status" value={status} />
        <div className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="도메인 또는 사이트명으로 검색..."
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 placeholder-slate-500 focus:border-[#3182f6] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#3182f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b64da] transition-colors"
          >
            검색
          </button>
          {(search || status) && (
            <Link
              href="/admin/resellers"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 transition-colors"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">도메인</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">사이트명</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">운영자</th>
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
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-6 py-3">
                  <Link
                    href={`/admin/resellers/${reseller.id}`}
                    className="font-mono text-[#3182f6] hover:text-[#3182f6]"
                  >
                    {reseller.domain}
                  </Link>
                </td>
                <td className="px-6 py-3 text-slate-600">
                  {reseller.siteName}
                </td>
                <td className="px-6 py-3 text-slate-600 text-xs">
                  {reseller.owner ? (
                    <span className="font-mono">{reseller.owner.email}</span>
                  ) : (
                    <span className="text-slate-400">미지정</span>
                  )}
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
                  colSpan={6}
                  className="px-6 py-8 text-center text-slate-600"
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
              href={buildQuery({ page: page - 1 })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              이전
            </Link>
          )}

          <span className="text-sm text-slate-500">
            {page} / {totalPages} 페이지
          </span>

          {page < totalPages && (
            <Link
              href={buildQuery({ page: page + 1 })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
