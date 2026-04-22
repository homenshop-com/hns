import { prisma } from "@/lib/db";
import Link from "next/link";
import TemplatesTable from "./templates-table";
import { parsePageParam } from "@/lib/pagination";

const TABS: Array<{ key: string; label: string; where?: Record<string, unknown> }> = [
  { key: "all",      label: "전체" },
  { key: "system",   label: "시스템 제공",  where: { userId: null } },
  { key: "user",     label: "유저 템플릿",  where: { userId: { not: null } } },
  { key: "free",     label: "무료",        where: { price: 0 } },
  { key: "paid",     label: "유료",        where: { price: { gt: 0 } } },
  { key: "inactive", label: "비활성",      where: { isActive: false } },
];

export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const tab = params.tab || "all";
  const search = params.search || "";
  const page = parsePageParam(params.page);
  const perPage = 20;

  const where: Record<string, unknown> = {};
  const activeTab = TABS.find((t) => t.key === tab);
  if (activeTab?.where) Object.assign(where, activeTab.where);
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { keywords: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
    ];
  }

  const [templates, totalCount, counts] = await Promise.all([
    prisma.template.findMany({
      where: where as any,
      select: {
        id: true, name: true, category: true, price: true,
        thumbnailUrl: true, isActive: true, isPublic: true,
        sortOrder: true, clicks: true, userId: true, demoSiteId: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.template.count({ where: where as any }),
    Promise.all([
      prisma.template.count(),
      prisma.template.count({ where: { userId: null } }),
      prisma.template.count({ where: { userId: { not: null } } }),
      prisma.template.count({ where: { price: 0 } }),
      prisma.template.count({ where: { price: { gt: 0 } } }),
      prisma.template.count({ where: { isActive: false } }),
    ]),
  ]);

  const totalPages = Math.ceil(totalCount / perPage);
  const [cAll, cSys, cUsr, cFree, cPaid, cInactive] = counts;
  const countMap: Record<string, number> = {
    all: cAll, system: cSys, user: cUsr, free: cFree, paid: cPaid, inactive: cInactive,
  };

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { tab, search, page: String(page), ...overrides };
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    return `/admin/templates?${p.toString()}`;
  }

  return (
    <>
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">템플릿 관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          공용 템플릿을 검토·편집하고 사용자 템플릿을 관리합니다. 디자인 수정
          버튼은 에디터로 이동한 뒤 저장 → 적용 순서로 원본에 반영됩니다.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 mb-5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={buildUrl({ tab: t.key, page: "1" })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-[#405189] text-[#405189]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-[11px] font-semibold ${active ? "text-[#405189]" : "text-slate-400"}`}>
                {countMap[t.key] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <form className="flex items-center gap-2 mb-4" action="/admin/templates" method="GET">
        <input type="hidden" name="tab" value={tab} />
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="이름·설명·키워드·카테고리로 검색"
          className="flex-1 max-w-md px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-[#405189] text-white text-sm font-medium rounded-md hover:bg-[#405189]/90"
        >
          검색
        </button>
        {search && (
          <Link
            href={buildUrl({ search: "", page: "1" })}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            초기화
          </Link>
        )}
      </form>

      {/* Table */}
      <TemplatesTable
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category ?? "",
          price: t.price,
          thumbnailUrl: t.thumbnailUrl ?? "",
          isActive: t.isActive,
          isPublic: t.isPublic,
          sortOrder: t.sortOrder,
          clicks: t.clicks,
          isSystem: t.userId === null,
          hasDemoSite: !!t.demoSiteId,
          updatedAt: t.updatedAt.toISOString(),
        }))}
        totalCount={totalCount}
        currentPage={page}
        totalPages={totalPages}
        perPage={perPage}
        buildUrlBase={buildUrl({})}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={buildUrl({ page: String(n) })}
              className={`px-3 py-1.5 text-sm rounded-md ${
                n === page
                  ? "bg-[#405189] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
