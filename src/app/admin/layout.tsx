import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import AdminSidebar from "./admin-sidebar";
import { canEditTemplates } from "@/lib/permissions";

// Base menu shown to every ADMIN. Template editing is gated separately
// (see `canEditTemplates`) because modifying the golden copy of a system
// template affects every new site minted from it.
const baseNavItems = [
  { href: "/admin", label: "대시보드", icon: "dashboard" },
  { href: "/admin/members", label: "회원 관리", icon: "members" },
  { href: "/admin/sites", label: "계정 관리", icon: "sites" },
  { href: "/admin/orders", label: "주문 관리", icon: "orders" },
  { href: "/admin/domains", label: "도메인 관리", icon: "domains" },
  { href: "/admin/boards", label: "게시판 관리", icon: "boards" },
  { href: "/admin/inbox", label: "이메일 수신함", icon: "inbox" },
  { href: "/admin/support", label: "고객 지원", icon: "support" },
  { href: "/admin/resellers", label: "리셀러 관리", icon: "resellers" },
  { href: "/admin/settings", label: "시스템 설정", icon: "settings" },
];
const templatesNavItem = {
  href: "/admin/templates",
  label: "템플릿 관리",
  icon: "templates",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // Template management is allowlist-gated — insert the menu item right
  // after "계정 관리" only for operators on the list.
  const email = session.user.email ?? "";
  const navItems = canEditTemplates(email)
    ? [
        ...baseNavItems.slice(0, 3),
        templatesNavItem,
        ...baseNavItems.slice(3),
      ]
    : baseNavItems;

  return (
    <div className="min-h-screen flex bg-[#f3f3f9] text-slate-700">
      <AdminSidebar email={email} navItems={navItems} />
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
