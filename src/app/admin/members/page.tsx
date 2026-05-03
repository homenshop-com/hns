import { prisma } from "@/lib/db";
import Link from "next/link";
import MemberTable from "./member-table";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 20;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const search = params.search || "";

  // Prospect placeholders live in /admin/prospects; keep them out of the
  // regular member list so admin search results aren't polluted by every
  // pre-built lead.
  const where = search
    ? {
        isProspect: false,
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : { isProspect: false };

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

  // Serialize dates for client component
  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">회원 관리</h1>
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
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 placeholder-slate-500 focus:border-[#405189] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574] transition-colors"
          >
            검색
          </button>
          {search && (
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
      <MemberTable users={serializedUsers} search={search} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/members?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
              href={`/admin/members?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
