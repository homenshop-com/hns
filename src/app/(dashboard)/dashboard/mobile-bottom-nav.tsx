"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "./dashboard-icons";

/**
 * Mobile bottom-tab navigation (≤640px). Hidden on desktop via CSS.
 * 5 tabs: 홈 / 사이트 / 주문 / 문의 / 더보기. "더보기" opens a sheet
 * with the remaining nav items + logout.
 *
 * Design: native-feeling bottom dock, safe-area aware, blue active tab,
 * follows DESIGN.md (Toss-inspired single accent, no gradient, hairline
 * top border, white surface).
 */
export default function MobileBottomNav({ unreadInquiries }: { unreadInquiries?: number }) {
  const pathname = usePathname() ?? "";
  // 네비 라벨은 dashboard.* 네임스페이스에 있음 (common.nav.* 아님).
  // 잘못된 네임스페이스 → "common.nav.navAdminMain" 같은 raw key가 노출되던 버그 수정.
  const t = useTranslations("dashboard");
  const tm = useTranslations("miscDash");

  const isActive = (prefix: string) =>
    prefix === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(prefix);

  const tabs: { href: string; icon: string; label: string; badge?: number }[] = [
    { href: "/dashboard", icon: "i-home", label: t("navAdminMain") },
    { href: "/dashboard/sites", icon: "i-grid", label: t("navMySites") },
    { href: "/dashboard/orders", icon: "i-bag", label: t("navOrders") },
    {
      href: "/dashboard/inquiries",
      icon: "i-mail",
      label: t("navInquiries"),
      badge: unreadInquiries && unreadInquiries > 0 ? unreadInquiries : undefined,
    },
    { href: "/dashboard/profile", icon: "i-user", label: t("navProfile") },
  ];

  return (
    <nav className="dv2-mobile-nav" aria-label={tm("mobileTabNavAria")}>
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`dv2-mobile-tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="ic">
              <Icon id={tab.icon} size={20} />
              {tab.badge != null && (
                <span className="badge" aria-label={tm("notificationsAria", { count: tab.badge })}>
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </span>
            <span className="lb">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
