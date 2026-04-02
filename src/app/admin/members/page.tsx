import { prisma } from "@/lib/db";
import Link from "next/link";

const PAGE_SIZE = 20;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const search = params.search || "";

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, totalCount] = await Promise.all([
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
      },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">회원 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}명
        </span>
      </div>

      {/* Search */}
      <form className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="이메일 또는 이름으로 검색..."
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
              href="/admin/members"
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
              <th className="px-6 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">이름</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">이메일</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">역할</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">상태</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">Account ID</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">가입일</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-6 py-3">
                  <Link
                    href={`/admin/members/${user.id}`}
                    className="text-cyan-400 hover:text-cyan-300"
                  >
                    {user.name || "-"}
                  </Link>
                </td>
                <td className="px-6 py-3 text-slate-400">
                  {user.email}
                </td>
                <td className="px-6 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-6 py-3">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-6 py-3 text-slate-500 font-mono text-xs">
                  {user.shopId ? <a href={`https://home.homenshop.com/${user.shopId}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">{user.shopId} ↗</a> : "-"}
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {user.createdAt.toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-slate-400"
                >
                  {search
                    ? `"${search}" 검색 결과가 없습니다.`
                    : "등록된 회원이 없습니다."}
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
              href={`/admin/members?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
              href={`/admin/members?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    ADMIN: "bg-cyan-500/10 text-cyan-400 ring-1 ring-inset ring-blue-600/20",
    RESELLER: "bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-purple-600/20",
    MEMBER: "bg-slate-800/30 text-slate-400 ring-1 ring-inset ring-slate-500/20",
  };

  return (
    <span
      className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${colors[role] || colors.MEMBER}`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-600/20",
    SUSPENDED: "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-600/20",
    DELETED: "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-600/20",
  };

  const labels: Record<string, string> = {
    ACTIVE: "활성",
    SUSPENDED: "정지",
    DELETED: "삭제",
  };

  return (
    <span
      className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${colors[status] || colors.ACTIVE}`}
    >
      {labels[status] || status}
    </span>
  );
}
