import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBalance } from "@/lib/credits";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import SignOutButton from "./sign-out-button";
import SupportUnreadIndicator from "./support-unread-indicator";
import { DashboardIconSprite, Icon } from "./dashboard-icons";
import "./dashboard-v2.css";

export type DashboardNavKey =
  | "home"
  | "sites"
  | "orders"
  | "boards"
  | "domains"
  | "credits"
  | "profile"
  | "support"
  | "templates"
  | "search"
  | "products"
  | "integrations";

export interface DashboardCrumb {
  label: string;
  href?: string;
}

export interface DashboardNavBadges {
  sites?: number;
  orders?: number;
  inquiries?: number;
}

export interface DashboardShellProps {
  active: DashboardNavKey;
  breadcrumbs: DashboardCrumb[];
  badges?: DashboardNavBadges;
  showSearch?: boolean;
  children: React.ReactNode;
}

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

export default async function DashboardShell({
  active,
  breadcrumbs,
  badges,
  showSearch = false,
  children,
}: DashboardShellProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, credits] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    getBalance(session.user.id),
  ]);

  const displayName = user?.name || user?.email?.split("@")[0] || "게스트";
  const cls = (key: DashboardNavKey) => (active === key ? "active" : undefined);

  return (
    <>
      <ImpersonationBanner />
      <DashboardIconSprite />
      <div className="dv2-app">
        {/* ───── SIDEBAR ───── */}
        <aside className="dv2-side">
          <Link href="/dashboard" className="dv2-brand" title="대시보드로">
            <div className="dv2-brand-mark">h</div>
            <div className="dv2-brand-name">
              home<span className="ns">Nshop</span>
            </div>
          </Link>

          <nav className="dv2-nav">
            <Link className={cls("home")} href="/dashboard">
              <span className="ic"><Icon id="i-home" /></span>
              <span className="label">관리자 메인</span>
            </Link>
            <Link className={cls("sites")} href="/dashboard/sites">
              <span className="ic"><Icon id="i-grid" /></span>
              <span className="label">내 홈페이지/쇼핑몰</span>
              {badges?.sites != null && badges.sites > 0 && (
                <span className="badge">{badges.sites}</span>
              )}
            </Link>
            <a className="soon" aria-disabled="true">
              <span className="ic"><Icon id="i-analytics" /></span>
              <span className="label">통계 · 분석</span>
              <span className="soon-tag">SOON</span>
            </a>
            <Link className={cls("orders")} href="/dashboard/orders">
              <span className="ic"><Icon id="i-bag" /></span>
              <span className="label">주문 관리</span>
              {badges?.orders != null && badges.orders > 0 && (
                <span className="badge g">{badges.orders}</span>
              )}
            </Link>
            <Link className={cls("boards")} href="/dashboard/boards">
              <span className="ic"><Icon id="i-mail" /></span>
              <span className="label">문의 · 예약</span>
              {badges?.inquiries != null && badges.inquiries > 0 && (
                <span className="badge">{badges.inquiries}</span>
              )}
            </Link>
            <Link className={cls("domains")} href="/dashboard/domains">
              <span className="ic"><Icon id="i-globe" /></span>
              <span className="label">도메인 관리</span>
            </Link>
          </nav>

          <div className="dv2-side-section">
            <div className="dv2-side-label">계정</div>
            <nav className="dv2-nav">
              <Link className={cls("credits")} href="/dashboard/credits">
                <span className="ic"><Icon id="i-credit" /></span>
                <span className="label">결제 · 크레딧</span>
              </Link>
              <Link className={cls("profile")} href="/dashboard/profile">
                <span className="ic"><Icon id="i-settings" /></span>
                <span className="label">관리자 정보</span>
              </Link>
              <Link className={cls("support")} href="/dashboard/support">
                <span className="ic"><Icon id="i-chat" /></span>
                <span className="label">도움말 · 지원</span>
                <SupportUnreadIndicator variant="count" />
              </Link>
            </nav>
          </div>

          <div className="dv2-side-footer">
            <div className="dv2-coin-card">
              <div className="row">
                <div className="ball">C</div>
                <div>
                  <div className="num">
                    {credits.toLocaleString()}{" "}
                    <span style={{ fontSize: 11, fontWeight: 600 }}>coin</span>
                  </div>
                  <div className="cap">AI 제작에 사용 가능</div>
                </div>
              </div>
              <Link className="go" href="/dashboard/credits">
                충전하기 <Icon id="i-chev-right" size={12} />
              </Link>
            </div>
          </div>
        </aside>

        {/* ───── MAIN ───── */}
        <div className="dv2-main">
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              {breadcrumbs.map((c, i) => (
                <span key={i} style={{ display: "contents" }}>
                  {i > 0 && <span className="sep">/</span>}
                  {c.href ? (
                    <Link href={c.href}>{c.label}</Link>
                  ) : (
                    <span className={i === breadcrumbs.length - 1 ? "cur" : undefined}>
                      {c.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
            {showSearch && (
              <Link
                href="/dashboard/search"
                className="dv2-search"
                style={{ textDecoration: "none" }}
              >
                <Icon id="i-search" size={16} />
                <input placeholder="홈페이지, 주문, 고객 검색…" readOnly />
                <span className="kbd">⌘K</span>
              </Link>
            )}
            <div className="dv2-spacer" />
            <div className="dv2-topbar-actions">
              <Link
                className="dv2-coin-pill"
                href="/dashboard/credits"
                title="AI 제작 코인"
              >
                <span className="ball">C</span>
                <span>{credits.toLocaleString()}</span>
                <span className="c">coin</span>
              </Link>
              <Link
                href="/dashboard/support"
                className="dv2-icon-btn"
                title="도움말 · 지원"
                style={{ position: "relative" }}
              >
                <Icon id="i-chat" size={17} />
                <SupportUnreadIndicator variant="dot" />
              </Link>
              <div className="dv2-lang">
                <LanguageSwitcher />
              </div>
              <Link
                href="/dashboard/profile"
                className="dv2-user"
                style={{ textDecoration: "none" }}
              >
                <div>
                  <div className="name">{displayName}</div>
                  <div className="role">Owner</div>
                </div>
                <div className="dv2-avatar">{initialsFrom(displayName)}</div>
              </Link>
              <SignOutButton />
            </div>
          </div>

          <div className="dv2-content">{children}</div>
        </div>
      </div>
    </>
  );
}
