import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";
import { formatKoreanPhone } from "@/lib/sms";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 20;

export default async function AdminProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const search = (params.search || "").trim();
  const tab = params.tab === "claimed" ? "claimed" : "pending";

  const where: Prisma.UserWhereInput =
    tab === "claimed"
      ? { claimedAt: { not: null } }
      : { isProspect: true };

  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search.replace(/\D/g, "") || search } },
          { shopId: { contains: search, mode: "insensitive" } },
          { prospectNote: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        shopId: true,
        email: true,
        isProspect: true,
        claimedAt: true,
        prospectNote: true,
        createdAt: true,
        sites: {
          select: {
            id: true,
            shopId: true,
            name: true,
            published: true,
            expiresAt: true,
            tempDomain: true,
            defaultLanguage: true,
          },
          take: 1,
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">잠재고객</h1>
          <p className="mt-1 text-sm text-slate-500">
            관리자가 미리 만들어 둔 사이트. 고객이 동일한 핸드폰 번호로 가입하면 자동으로 인계됩니다.
          </p>
        </div>
        <Link
          href="/admin/prospects/new"
          className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574] transition-colors"
        >
          + 잠재고객 등록
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <Link
          href="/admin/prospects"
          className={`px-4 py-2 text-sm border-b-2 -mb-px ${
            tab === "pending"
              ? "border-[#405189] text-[#405189] font-medium"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          대기 중
        </Link>
        <Link
          href="/admin/prospects?tab=claimed"
          className={`px-4 py-2 text-sm border-b-2 -mb-px ${
            tab === "claimed"
              ? "border-[#405189] text-[#405189] font-medium"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          인계 완료
        </Link>
        <span className="ml-auto self-center text-sm text-slate-500">
          총 {totalCount.toLocaleString()}명
        </span>
      </div>

      {/* Search */}
      <form className="mb-6">
        {tab === "claimed" && <input type="hidden" name="tab" value="claimed" />}
        <div className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="이름, 핸드폰, shopId, 메모 검색..."
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 placeholder-slate-500 focus:border-[#405189] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574]"
          >
            검색
          </button>
          {search && (
            <Link
              href={tab === "claimed" ? "/admin/prospects?tab=claimed" : "/admin/prospects"}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">이름/상호</th>
              <th className="px-4 py-3 text-left font-medium">핸드폰</th>
              <th className="px-4 py-3 text-left font-medium">shopId / 사이트</th>
              <th className="px-4 py-3 text-left font-medium">만료일</th>
              <th className="px-4 py-3 text-left font-medium">메모</th>
              <th className="px-4 py-3 text-left font-medium">
                {tab === "claimed" ? "인계일" : "생성일"}
              </th>
              <th className="px-4 py-3 text-left font-medium">미리보기</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {tab === "claimed"
                    ? "인계 완료된 회원이 없습니다."
                    : "등록된 잠재고객이 없습니다. 우측 상단에서 새로 등록할 수 있습니다."}
                </td>
              </tr>
            )}
            {users.map((u) => {
              const site = u.sites[0];
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {u.name ?? "—"}
                    {u.isProspect && (
                      <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        잠재
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-mono">
                    {u.phone ? formatKoreanPhone(u.phone) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-800">
                      {site?.shopId ?? u.shopId ?? "—"}
                    </div>
                    {site && (
                      <div className="text-xs text-slate-500">{site.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {site?.expiresAt
                      ? new Date(site.expiresAt).toLocaleDateString("ko-KR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                    {u.prospectNote || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {tab === "claimed" && u.claimedAt
                      ? new Date(u.claimedAt).toLocaleString("ko-KR")
                      : new Date(u.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3">
                    {site && (
                      <a
                        href={`https://${site.tempDomain}/${site.shopId}/${site.defaultLanguage}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#405189] hover:underline text-xs"
                      >
                        열기 ↗
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/prospects?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}${tab === "claimed" ? "&tab=claimed" : ""}`}
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
              href={`/admin/prospects?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}${tab === "claimed" ? "&tab=claimed" : ""}`}
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
