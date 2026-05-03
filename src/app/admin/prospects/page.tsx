import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";
import { formatKoreanPhone } from "@/lib/sms";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 20;

/**
 * Prospect listing — sites that an admin has reserved for a future
 * customer by setting Site.prospectPhone (or, in legacy data, sites
 * owned by a User.isProspect placeholder). The "claimed" tab shows
 * users who have completed the handover, identified by claimedAt.
 */
export default async function AdminProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const search = (params.search || "").trim();
  const tab = params.tab === "claimed" ? "claimed" : "pending";

  if (tab === "claimed") {
    return ClaimedView({ page, search });
  }
  return PendingView({ page, search });
}

async function PendingView({ page, search }: { page: number; search: string }) {
  // Pending = sites that either have a prospectPhone set OR are owned by
  // a legacy User.isProspect placeholder. Both surface here so admin
  // sees the full handover backlog in one place.
  const where: Prisma.SiteWhereInput = {
    OR: [
      { prospectPhone: { not: null } },
      { user: { isProspect: true } },
    ],
  };

  if (search) {
    const digits = search.replace(/\D/g, "");
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { shopId: { contains: search, mode: "insensitive" } },
          { prospectNote: { contains: search, mode: "insensitive" } },
          ...(digits ? [{ prospectPhone: { contains: digits } }] : []),
          { user: { phone: { contains: digits || search } } },
        ],
      },
    ];
  }

  const [sites, totalCount] = await Promise.all([
    prisma.site.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        shopId: true,
        prospectPhone: true,
        prospectNote: true,
        published: true,
        expiresAt: true,
        tempDomain: true,
        defaultLanguage: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            isProspect: true,
          },
        },
      },
    }),
    prisma.site.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <ProspectsLayout tab="pending" totalCount={totalCount} search={search}>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">사이트</th>
              <th className="px-4 py-3 text-left font-medium">소유자</th>
              <th className="px-4 py-3 text-left font-medium">잠재 핸드폰</th>
              <th className="px-4 py-3 text-left font-medium">만료일</th>
              <th className="px-4 py-3 text-left font-medium">메모</th>
              <th className="px-4 py-3 text-left font-medium">생성일</th>
              <th className="px-4 py-3 text-left font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sites.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  등록된 잠재고객이 없습니다. 사이트 상세 페이지에서 &ldquo;실제 소유자 핸드폰&rdquo;을 설정하세요.
                </td>
              </tr>
            )}
            {sites.map((s) => {
              const phoneRaw = s.prospectPhone ?? s.user.phone ?? null;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs font-mono text-slate-500">{s.shopId}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {s.user.email}
                    {s.user.isProspect && (
                      <span className="ml-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        legacy placeholder
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-mono">
                    {phoneRaw ? formatKoreanPhone(phoneRaw) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {s.expiresAt
                      ? new Date(s.expiresAt).toLocaleDateString("ko-KR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                    {s.prospectNote || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {new Date(s.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 text-xs">
                      <Link
                        href={`/admin/sites/${s.id}`}
                        className="text-[#405189] hover:underline"
                      >
                        편집
                      </Link>
                      <a
                        href={`https://${s.tempDomain}/${s.shopId}/${s.defaultLanguage}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:underline"
                      >
                        열기 ↗
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        search={search}
        tab="pending"
      />
    </ProspectsLayout>
  );
}

async function ClaimedView({ page, search }: { page: number; search: string }) {
  const where: Prisma.UserWhereInput = { claimedAt: { not: null } };
  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search.replace(/\D/g, "") || search } },
          { shopId: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { claimedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        shopId: true,
        claimedAt: true,
        sites: {
          select: { id: true, name: true, shopId: true },
          take: 1,
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <ProspectsLayout tab="claimed" totalCount={totalCount} search={search}>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">회원</th>
              <th className="px-4 py-3 text-left font-medium">이메일</th>
              <th className="px-4 py-3 text-left font-medium">핸드폰</th>
              <th className="px-4 py-3 text-left font-medium">사이트</th>
              <th className="px-4 py-3 text-left font-medium">인계일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  인계 완료된 회원이 없습니다.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const site = u.sites[0];
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {u.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-slate-700 font-mono">
                    {u.phone ? formatKoreanPhone(u.phone) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {site ? (
                      <Link
                        href={`/admin/sites/${site.id}`}
                        className="text-[#405189] hover:underline"
                      >
                        {site.name} ({site.shopId})
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {u.claimedAt
                      ? new Date(u.claimedAt).toLocaleString("ko-KR")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        search={search}
        tab="claimed"
      />
    </ProspectsLayout>
  );
}

function ProspectsLayout({
  tab,
  totalCount,
  search,
  children,
}: {
  tab: "pending" | "claimed";
  totalCount: number;
  search: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">잠재고객</h1>
          <p className="mt-1 text-sm text-slate-500">
            관리자 사이트에 &ldquo;실제 소유자 핸드폰&rdquo;을 설정해 두면, 고객이 동일 번호로 회원가입할 때 자동 인계됩니다.
          </p>
        </div>
      </div>

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
          총 {totalCount.toLocaleString()}건
        </span>
      </div>

      <form className="mb-6">
        {tab === "claimed" && <input type="hidden" name="tab" value="claimed" />}
        <div className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder={
              tab === "pending"
                ? "사이트명, shopId, 핸드폰, 메모"
                : "이름, 이메일, 핸드폰, shopId"
            }
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

      {children}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  search,
  tab,
}: {
  page: number;
  totalPages: number;
  search: string;
  tab: "pending" | "claimed";
}) {
  if (totalPages <= 1) return null;
  const qs = (n: number) => {
    const parts = [`page=${n}`];
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    if (tab === "claimed") parts.push("tab=claimed");
    return parts.join("&");
  };
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link
          href={`/admin/prospects?${qs(page - 1)}`}
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
          href={`/admin/prospects?${qs(page + 1)}`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          다음
        </Link>
      )}
    </div>
  );
}
