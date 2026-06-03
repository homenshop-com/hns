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

  const [users, totalCount, resellers] = await Promise.all([
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
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
