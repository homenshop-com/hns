import { prisma } from "@/lib/db";
import Link from "next/link";
import SitesTable from "./sites-table";
import { parsePageParam } from "@/lib/pagination";
import { requireAdminAccess, scopeResellerId } from "@/lib/admin-access";

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
  const access = await requireAdminAccess();
  const rid = scopeResellerId(access);
  const params = await searchParams;
  const tab = params.tab || "all";
  const search = params.search || "";
  const filterBy = params.filterBy || "shopId";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";
  const page = parsePageParam(params.page);
  const perPage = 20;
  // Reseller operators are hard-scoped to their own attribution; only full
  // admins get to pick a signup source. "none" = direct homenshop.net signups.
  const resellerFilter = rid ? "" : params.reseller || "";

  // Owner-level scope: reseller operators see only their attributed accounts;
  // a full admin's reseller-filter selection narrows the same way. Folded into
  // scopeBase so the account-type tab counts reflect the active source filter.
  const scopeBase: Record<string, unknown> = { isTemplateStorage: false };
  const scopeUser: Record<string, unknown> = {};
  if (rid) scopeUser.resellerId = rid;
  else if (resellerFilter === "none") scopeUser.resellerId = null;
  else if (resellerFilter) scopeUser.resellerId = resellerFilter;
  if (Object.keys(scopeUser).length > 0) scopeBase.user = scopeUser;

  // Build where clause — hide template-storage clones from admin lists
  const where: Record<string, unknown> = { ...scopeBase };
  const activeTab = TABS.find((t) => t.key === tab);
  if (activeTab && activeTab.type !== undefined) {
    where.accountType = activeTab.type;
  }
  if (search) {
    if (filterBy === "email") {
      where.user = { ...scopeUser, email: { contains: search, mode: "insensitive" } };
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

  const [sites, totalCount, countByType, resellers, sourceRows] = await Promise.all([
    prisma.site.findMany({
      where: where as any,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            reseller: { select: { siteName: true, domain: true } },
          },
        },
        domains: { select: { domain: true } },
        pages: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.site.count({ where: where as any }),
    Promise.all([
      prisma.site.count({ where: { ...scopeBase } as any }),
      prisma.site.count({ where: { ...scopeBase, accountType: "0" } as any }),
      prisma.site.count({ where: { ...scopeBase, accountType: "1" } as any }),
      prisma.site.count({ where: { ...scopeBase, accountType: "9" } as any }),
      prisma.site.count({ where: { ...scopeBase, accountType: "2" } as any }),
    ]),
    // Reseller picker — full admins only; reseller operators are scoped.
    rid
      ? Promise.resolve([])
      : prisma.reseller.findMany({
          orderBy: { siteName: "asc" },
          select: { id: true, siteName: true, domain: true },
        }),
    // Per-source account tally for the dashboard (full admin only). Global —
    // independent of the active tab/search/filter so the numbers stay stable.
    // Sites can't groupBy a relation field, so aggregate owners in JS (small N).
    rid
      ? Promise.resolve([])
      : prisma.site.findMany({
          where: { isTemplateStorage: false },
          select: { user: { select: { resellerId: true } } },
        }),
  ]);

  // Build the signup-source dashboard: 전체 + 직접 가입 + each reseller that
  // actually has accounts, sorted by count desc. Each chip links to its filter.
  const countByReseller = new Map<string | null, number>();
  let grandTotal = 0;
  for (const s of sourceRows) {
    const key = s.user.resellerId;
    countByReseller.set(key, (countByReseller.get(key) ?? 0) + 1);
    grandTotal += 1;
  }
  const sourceCards = resellers
    .map((r) => ({
      key: r.id,
      label: r.siteName,
      domain: r.domain,
      count: countByReseller.get(r.id) ?? 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const directCount = countByReseller.get(null) ?? 0;

  const totalPages = Math.ceil(totalCount / perPage);
  const [countAll, countFree, countPaid, countExpired, countTest] = countByType;
  const counts: Record<string, number> = { all: countAll, free: countFree, paid: countPaid, expired: countExpired, test: countTest };

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { tab, search, filterBy, dateFrom, dateTo, reseller: resellerFilter, page: String(page), ...overrides };
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
  if (resellerFilter) paginationParts.set("reseller", resellerFilter);
  const buildUrlBase = `/admin/sites?${paginationParts.toString()}`;

  // Serialize for client component
  const serializedSites = sites.map(s => ({
    id: s.id,
    shopId: s.shopId,
    tempDomain: s.tempDomain,
    accountType: s.accountType,
    email: s.user.email,
    domain: s.domains.length > 0 ? s.domains[0].domain : "",
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    updatedAt: s.updatedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    pageCount: s.pages.length,
    userId: s.user.id,
    reseller: s.user.reseller
      ? { siteName: s.user.reseller.siteName, domain: s.user.reseller.domain }
      : null,
  }));

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-6">Account List</h1>

      {/* Signup-source dashboard (full admin only) */}
      {!rid && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-700">가입경로별 계정 실적</h2>
            <span className="text-xs text-slate-400">
              총 {grandTotal.toLocaleString()}개 · 리셀러 {sourceCards.length}곳
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <SourceCard
              href="/admin/sites"
              label="전체"
              count={grandTotal}
              total={grandTotal}
              active={!resellerFilter}
              accent
            />
            <SourceCard
              href="/admin/sites?reseller=none"
              label="직접 가입"
              sub="homenshop.net"
              count={directCount}
              total={grandTotal}
              active={resellerFilter === "none"}
            />
            {sourceCards.map((c) => (
              <SourceCard
                key={c.key}
                href={`/admin/sites?reseller=${encodeURIComponent(c.key)}`}
                label={c.label}
                sub={c.domain}
                count={c.count}
                total={grandTotal}
                active={resellerFilter === c.key}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildUrl({ tab: t.key, page: "1" })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-[#3182f6] text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label} ({counts[t.key] ?? 0})
          </Link>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-slate-500 mb-4">Search</h3>
        <form className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="tab" value={tab} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date</label>
            <div className="flex items-center gap-2">
              <input type="date" name="dateFrom" defaultValue={dateFrom} className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800" />
              <span className="text-slate-600">~</span>
              <input type="date" name="dateTo" defaultValue={dateTo} className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Filter</label>
            <div className="flex gap-2">
              <select name="filterBy" defaultValue={filterBy} className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                <option value="shopId">Site ID</option>
                <option value="email">Email</option>
                <option value="domain">Domain</option>
              </select>
              <input type="text" name="search" defaultValue={search} placeholder="Search keyword" className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 w-48" />
            </div>
          </div>
          {!rid && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">가입경로</label>
              <select name="reseller" defaultValue={resellerFilter} className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                <option value="">전체 가입경로</option>
                <option value="none">직접 가입 (homenshop.net)</option>
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.siteName} ({r.domain})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="bg-[#3182f6] text-white px-6 py-2 rounded text-sm font-medium hover:bg-[#1b64da]">
            Search
          </button>
          {(search || dateFrom || dateTo || resellerFilter) && (
            <Link
              href={buildUrl({ search: "", dateFrom: "", dateTo: "", reseller: "", page: "1" })}
              className="border border-slate-300 text-slate-600 px-4 py-2 rounded text-sm font-medium hover:bg-slate-50"
            >
              초기화
            </Link>
          )}
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
        showReseller={!rid}
        useImpersonateApi={!!rid}
      />
    </div>
  );
}

function SourceCard({
  href,
  label,
  sub,
  count,
  total,
  active,
  accent,
}: {
  href: string;
  label: string;
  sub?: string;
  count: number;
  total: number;
  active?: boolean;
  accent?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  return (
    <Link
      href={href}
      className={`shrink-0 w-[150px] rounded-xl border p-3 transition-colors ${
        active
          ? "border-[#3182f6] bg-[#3182f6]/5 ring-1 ring-[#3182f6]/30"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      title={sub ? `${label} (${sub})` : label}
    >
      <div
        className={`text-xs font-medium truncate ${accent ? "text-[#3182f6]" : "text-slate-600"}`}
      >
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
        {count.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400 truncate">
        {sub ? `${sub} · ` : ""}
        {pct}%
      </div>
    </Link>
  );
}
