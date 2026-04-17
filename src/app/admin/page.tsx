import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const [membersCount, sitesCount, ordersCount, productsCount, recentUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.site.count(),
      prisma.order.count(),
      prisma.product.count(),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

  const stats = [
    {
      label: "전체 회원",
      value: membersCount,
      href: "/admin/members",
      gradient: "from-cyan-500 to-blue-500",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      ),
    },
    {
      label: "전체 사이트",
      value: sitesCount,
      href: "/admin/sites",
      gradient: "from-violet-500 to-purple-500",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
    },
    {
      label: "전체 주문",
      value: ordersCount,
      href: "/admin/orders",
      gradient: "from-emerald-500 to-teal-500",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      ),
    },
    {
      label: "전체 상품",
      value: productsCount,
      href: "#",
      gradient: "from-amber-500 to-orange-500",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">서비스 현황을 한눈에 확인하세요.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl bg-white border border-slate-200 p-5 hover:border-slate-300 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`bg-gradient-to-br ${stat.gradient} p-2 rounded-lg text-white`}>
                {stat.icon}
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stat.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>

      {/* Recent Signups */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">최근 가입 회원</h2>
          <Link href="/admin/members" className="text-xs font-medium text-[#405189] hover:text-[#405189] transition-colors">
            전체 보기 &rarr;
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이름</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이메일</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">역할</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/admin/members/${user.id}`} className="font-medium text-slate-800 hover:text-[#405189] transition-colors">
                      {user.name || "-"}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{user.email}</td>
                  <td className="px-6 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-6 py-3"><StatusBadge status={user.status} /></td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{user.createdAt.toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
              {recentUsers.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">가입된 회원이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const s: Record<string, string> = {
    ADMIN: "bg-[#405189]/10 text-[#405189] ring-[#405189]/30",
    RESELLER: "bg-violet-50 text-violet-700 ring-violet-200",
    MEMBER: "bg-slate-500/10 text-slate-600 ring-slate-400/20",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s[role] || s.MEMBER}`}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    SUSPENDED: "bg-amber-50 text-amber-700 ring-amber-200",
    DELETED: "bg-red-50 text-red-700 ring-red-200",
  };
  const labels: Record<string, string> = { ACTIVE: "활성", SUSPENDED: "정지", DELETED: "삭제" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s[status] || s.ACTIVE}`}>
      {labels[status] || status}
    </span>
  );
}
