import { prisma } from "@/lib/db";
import Link from "next/link";

const ACCOUNT_TYPES: Record<string, { label: string; color: string }> = {
  "0": { label: "Free", color: "bg-cyan-500/10 text-cyan-400" },
  "1": { label: "Paid", color: "bg-emerald-500/10 text-emerald-400" },
  "2": { label: "Expired", color: "bg-red-500/10 text-red-400" },
  "4": { label: "Test", color: "bg-amber-500/10 text-amber-400" },
};

const TABS = [
  { key: "all", label: "전체" },
  { key: "free", label: "무료계정", type: "0" },
  { key: "paid", label: "유료계정", type: "1" },
  { key: "expired", label: "만료계정", type: "2" },
  { key: "test", label: "테스트", type: "4" },
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

  // Tab filter
  const activeTab = TABS.find((t) => t.key === tab);
  if (activeTab && activeTab.type !== undefined) {
    where.accountType = activeTab.type;
  }

  // Search filter
  if (search) {
    if (filterBy === "email") {
      where.user = { email: { contains: search, mode: "insensitive" } };
    } else if (filterBy === "domain") {
      where.domains = { some: { domain: { contains: search, mode: "insensitive" } } };
    } else {
      where.shopId = { contains: search, mode: "insensitive" };
    }
  }

  // Date range filter
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59");
  }

  const [sites, totalCount, countByType] = await Promise.all([
    prisma.site.findMany({
      where: where as any,
      include: {
        user: { select: { email: true, name: true } },
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
      prisma.site.count({ where: { accountType: "2" } }),
      prisma.site.count({ where: { accountType: "4" } }),
    ]),
  ]);

  const totalPages = Math.ceil(totalCount / perPage);
  const [countAll, countFree, countPaid, countExpired, countTest] = countByType;
  const counts: Record<string, number> = {
    all: countAll,
    free: countFree,
    paid: countPaid,
    expired: countExpired,
    test: countTest,
  };

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { tab, search, filterBy, dateFrom, dateTo, page: String(page), ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    return `/admin/sites?${p.toString()}`;
  }

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
                <option value="shopId">Shop ID</option>
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
      <div className="bg-[#1e293b]/80 rounded-xl border border-slate-700/30">
        <div className="p-4 border-b border-slate-700/30 flex justify-between items-center">
          <span className="font-semibold text-slate-200">Results ({totalCount} total)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/20 bg-slate-800/30 text-left bg-slate-800/30">
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">NO</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">TYPE</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">EMAIL</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">DOMAIN</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">SHOP ID</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-center">
                  <span className="text-red-400">EXP DATE</span>
                </th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">LAST UPDATE</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">REGISTERED</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-right">DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, i) => {
                const no = totalCount - (page - 1) * perPage - i;
                const typeInfo = ACCOUNT_TYPES[site.accountType] || ACCOUNT_TYPES["0"];
                const isExpired = site.expiresAt && new Date(site.expiresAt) < new Date();
                return (
                  <tr key={site.id} className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-500">{no}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${typeInfo.color}`}>
                        {site.accountType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{site.user.email}</td>
                    <td className="px-4 py-3">
                      {site.domains.length > 0 ? (
                        <span className="text-cyan-400">{site.domains[0].domain}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/sites/${site.id}`} className="text-cyan-400 hover:text-cyan-300">
                        {site.shopId}
                      </Link>
                    </td>
                    <td className={`px-4 py-3 text-center font-medium ${isExpired ? "text-red-400" : "text-emerald-400"}`}>
                      {site.expiresAt ? new Date(site.expiresAt).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {site.updatedAt.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {site.createdAt.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/sites/${site.id}`}
                        className="inline-block bg-cyan-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-cyan-600"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {sites.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-1 p-4 border-t border-slate-700/30">
            {page > 1 && (
              <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1 rounded text-sm border border-slate-700/30 hover:bg-slate-800/30">
                Prev
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 5, totalPages - 9));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <Link
                  key={p}
                  href={buildUrl({ page: String(p) })}
                  className={`px-3 py-1 rounded text-sm ${p === page ? "bg-cyan-500 text-white" : "border border-slate-700/30 hover:bg-slate-800/30"}`}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1 rounded text-sm border border-slate-700/30 hover:bg-slate-800/30">
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
