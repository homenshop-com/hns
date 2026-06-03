import { prisma } from "@/lib/db";
import Link from "next/link";
import MemberTable from "./member-table";
import { parsePageParam } from "@/lib/pagination";
import { requireAdminAccess, scopeResellerId } from "@/lib/admin-access";

const PAGE_SIZE = 20;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; reseller?: string }>;
}) {
  const access = await requireAdminAccess();
  const rid = scopeResellerId(access);
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const search = params.search || "";
  // Reseller operators are hard-scoped to their own attribution, so the
  // selector is a no-op for them; only full admins get to pick.
  const resellerFilter = rid ? "" : params.reseller || "";

  // Translate the reseller selector into a Prisma filter:
  //  - reseller operator  → always their own resellerId
  //  - "none"             → members who signed up directly (no reseller)
  //  - a reseller id      → that reseller's signups
  //  - "" (전체)          → no filter
  const resellerWhere = rid
    ? { resellerId: rid }
    : resellerFilter === "none"
      ? { resellerId: null }
      : resellerFilter
        ? { resellerId: resellerFilter }
        : {};

  // Prospect placeholders live in /admin/prospects; keep them out of the
  // regular member list so admin search results aren't polluted by every
  // pre-built lead. Reseller operators only see members attributed to them.
  const where = {
    isProspect: false,
    ...resellerWhere,
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, totalCount, resellers, sourceCounts] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        shopId: true,
        createdAt: true,
        reseller: { select: { id: true, siteName: true, domain: true } },
      },
    }),
    prisma.user.count({ where }),
    // Only full admins need the reseller picker; reseller operators are scoped.
    rid
      ? Promise.resolve([])
      : prisma.reseller.findMany({
          orderBy: { siteName: "asc" },
          select: { id: true, siteName: true, domain: true },
        }),
    // Per-source signup tally for the dashboard (full admin only). Global —
    // independent of the active search/filter so the numbers stay stable.
    rid
      ? Promise.resolve([])
      : prisma.user.groupBy({
          by: ["resellerId"],
          where: { isProspect: false },
          _count: { _all: true },
        }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Build the signup-source dashboard: 전체 + 직접 가입 + each reseller that
  // actually has members, sorted by count desc. Each chip links to its filter.
  const countByReseller = new Map<string | null, number>();
  let grandTotal = 0;
  for (const g of sourceCounts) {
    const n = g._count._all;
    countByReseller.set(g.resellerId, n);
    grandTotal += n;
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

  // Serialize dates for client component
  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  // Build a query string that preserves the active filters across pagination.
  const buildQuery = (p: number) => {
    const sp = new URLSearchParams();
    if (p > 1) sp.set("page", String(p));
    if (search) sp.set("search", search);
    if (resellerFilter) sp.set("reseller", resellerFilter);
    const qs = sp.toString();
    return qs ? `/admin/members?${qs}` : "/admin/members";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">회원 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}명
        </span>
      </div>

      {/* Signup-source dashboard (full admin only) */}
      {!rid && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-700">가입경로별 실적</h2>
            <span className="text-xs text-slate-400">
              총 {grandTotal.toLocaleString()}명 · 리셀러 {sourceCards.length}곳
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <SourceCard
              href="/admin/members"
              label="전체"
              count={grandTotal}
              total={grandTotal}
              active={!resellerFilter}
              accent
            />
            <SourceCard
              href="/admin/members?reseller=none"
              label="직접 가입"
              sub="homenshop.net"
              count={directCount}
              total={grandTotal}
              active={resellerFilter === "none"}
            />
            {sourceCards.map((c) => (
              <SourceCard
                key={c.key}
                href={`/admin/members?reseller=${encodeURIComponent(c.key)}`}
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

      {/* Search + reseller filter */}
      <form className="mb-6">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="이메일 또는 이름으로 검색..."
            className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 placeholder-slate-500 focus:border-[#3182f6] focus:outline-none"
          />
          {!rid && (
            <select
              name="reseller"
              defaultValue={resellerFilter}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#3182f6] focus:outline-none"
            >
              <option value="">전체 가입경로</option>
              <option value="none">직접 가입 (homenshop.net)</option>
              {resellers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.siteName} ({r.domain})
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="rounded-lg bg-[#3182f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b64da] transition-colors"
          >
            검색
          </button>
          {(search || resellerFilter) && (
            <Link
              href="/admin/members"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 transition-colors"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Table with checkboxes */}
      <MemberTable users={serializedUsers} search={search} showReseller={!rid} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildQuery(page - 1)}
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
              href={buildQuery(page + 1)}
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
