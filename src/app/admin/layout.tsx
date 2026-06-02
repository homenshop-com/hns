import AdminSidebar from "./admin-sidebar";
import { canEditTemplates } from "@/lib/permissions";
import { getAdminAccess } from "@/lib/admin-access";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import "./admin-shell.css";

// Base menu shown to every ADMIN. Template editing is gated separately
// (see `canEditTemplates`) because modifying the golden copy of a system
// template affects every new site minted from it.
const baseNavItems = [
  { href: "/admin", label: "대시보드", icon: "dashboard" },
  { href: "/admin/members", label: "회원 관리", icon: "members" },
  { href: "/admin/prospects", label: "잠재고객", icon: "members" },
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

// Reseller operators get a scoped subset — only the four sections that can be
// filtered to their own attributed customers. System settings, reseller
// management, and everything else is admin-only.
const resellerNavItems = [
  { href: "/admin", label: "대시보드", icon: "dashboard" },
  { href: "/admin/members", label: "회원 관리", icon: "members" },
  { href: "/admin/prospects", label: "잠재고객", icon: "members" },
  { href: "/admin/sites", label: "계정 관리", icon: "sites" },
  { href: "/admin/orders", label: "주문 관리", icon: "orders" },
  // Settlement still lives in the member dashboard (/dashboard/reseller);
  // expose it here so the reseller admin console is the single hub.
  { href: "/dashboard/reseller", label: "리셀러 정산", icon: "orders" },
  // Self-service white-label settings (site name, logo, copyright, SEO) for
  // the operator's own reseller. Domain / revenue-share stay admin-only.
  { href: "/admin/account", label: "리셀러 설정", icon: "settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAdminAccess();
  if (!access) {
    redirect("/dashboard");
  }

  const session = await auth();
  const email = session?.user?.email ?? "";

  // Reseller operators see a fixed, scoped nav. Full admins get the complete
  // menu (with template management allowlist-gated right after "계정 관리").
  const navItems =
    access.kind === "reseller"
      ? resellerNavItems
      : canEditTemplates(email)
        ? [
            ...baseNavItems.slice(0, 3),
            templatesNavItem,
            ...baseNavItems.slice(3),
          ]
        : baseNavItems;

  return (
    <div className="adm-shell">
      <AdminSidebar
        email={email}
        navItems={navItems}
        badge={access.kind === "reseller" ? "리셀러 운영자" : undefined}
      />
      <main className="adm-main">
        <div className="adm-content">{children}</div>
      </main>
    </div>
  );
}
