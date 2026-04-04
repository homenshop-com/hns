import { prisma } from "@/lib/db";
import Link from "next/link";
import SitesTable from "./sites-table";

const TABS = [
  { key: "all", label: "전체" },
  { key: "free", label: "무료계정", type: "0" },
  { key: "paid", label: "유료계정", type: "1" },
  { key: "expired", label: "만료계정", type: "9" },
  { key: "test", label: "테스트", type: "2" },
];

export default async function AdminSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const tab = params.tab || "all";
  const search = params.search || "";
  const filterBy = params.filterBy || "shopId";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";
  const page = parseInt(params.page || "1", 10);
  const perPage = 20;

  // Build where clause
  const where: Record<string, unknown> = {};
  const activeTab = TABS.find((t) => t.key === tab);
  if (activeTab && activeTab.type !== undefined) {
    where.accountType = activeTab.type;
  }
  if (search) {
    if (filterBy === "email") {
      where.user = { email: { contains: search, mode: "insensitive" } };
    } else if (filterBy === "domain") {
      where.domains = { some: { domain: { contains: search, mode: "insensitive" } } };
    } else {
      where.shopId = { contains: search, mode: "insensitive" };
    }
  }
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59");
  }

  const [sites, totalCount, countByType] = await Promise.all([
    prisma.site.findMany({
      where: where as any,
      include: {
        user: { select: { id: true, email: true, name: true } },
        domains: { select: { domain: true } },
        pages: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.site.count({ where: where as any }),
    Promise.all([
      prisma.site.count(),
      prisma.site.count({ where: { accountType: "0" } }),
      prisma.site.count({ where: { accountType: "1" } }),
      prisma.site.count({ where: { accountType: "9" } }),
      prisma.site.count({ where: { accountType: "2" } }),
    ]),
  ]);

  const totalPages = Math.ceil(totalCount / perPage);
  const [countAll, countFree, countPaid, countExpired, countTest] = countByType;
  const counts: Record<string, number> = { all: countAll, free: countFree, paid: countPaid, expired: countExpired, test: countTest };

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { tab, search, filterBy, dateFrom, dateTo, page: String(page), ...overrides };
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    return `/admin/sites?${p.toString()}`;
  }

  // Base URL for pagination (without page param)
  const paginationParts = new URLSearchParams();
  if (tab) paginationParts.set("tab", tab);
  if (search) paginationParts.set("search", search);
  if (filterBy) paginationParts.set("filterBy", filterBy);
  if (dateFrom) paginationParts.set("dateFrom", dateFrom);
  if (dateTo) paginationParts.set("dateTo", dateTo);
  const buildUrlBase = `/admin/sites?${paginationParts.toString()}`;

  // Serialize for client component
  const serializedSites = sites.map(s => ({
    id: s.id,
    shopId: s.shopId,
    accountType: s.accountType,
    email: s.user.email,
    domain: s.domains.length > 0 ? s.domains[0].domain : "",
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    updatedAt: s.updatedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    pageCount: s.pages.length,
    userId: s.user.id,
  }));

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-6">Account List</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildUrl({ tab: t.key, page: "1" })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-cyan-500 text-white"
                : "bg-[#1e293b]/80 border border-slate-700/30 text-slate-400 hover:bg-slate-800/30"
            }`}
          >
            {t.label} ({counts[t.key] ?? 0})
          </Link>
        ))}
      </div>

      {/* Search */}
      <div className="bg-[#1e293b]/80 rounded-xl border border-slate-700/30 p-6 mb-6">
        <h3 className="text-sm font-semibold text-slate-500 mb-4">Search</h3>
        <form className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="tab" value={tab} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date</label>
            <div className="flex items-center gap-2">
              <input type="date" name="dateFrom" defaultValue={dateFrom} className="border border-slate-600/40 rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-200" />
              <span className="text-slate-400">~</span>
              <input type="date" name="dateTo" defaultValue={dateTo} className="border border-slate-600/40 rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-200" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Filter</label>
            <div className="flex gap-2">
              <select name="filterBy" defaultValue={filterBy} className="border border-slate-600/40 rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-200">
                <option value="shopId">Site ID</option>
                <option value="email">Email</option>
                <option value="domain">Domain</option>
              </select>
              <input type="text" name="search" defaultValue={search} placeholder="Search keyword" className="border border-slate-600/40 rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-200 w-48" />
            </div>
          </div>
          <button type="submit" className="bg-cyan-500 text-white px-6 py-2 rounded text-sm font-medium hover:bg-cyan-600">
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      <SitesTable
        sites={serializedSites}
        totalCount={totalCount}
        currentPage={page}
        totalPages={totalPages}
        perPage={perPage}
        buildUrlBase={buildUrlBase}
      />
    </div>
  );
}
