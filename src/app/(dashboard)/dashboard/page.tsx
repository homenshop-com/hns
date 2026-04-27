import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import SignOutButton from "./sign-out-button";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import EmailVerifyBanner from "./email-verify-banner";
import { getSettingBool } from "@/lib/settings";
import "./dashboard-v2.css";
import { DashboardIconSprite, Icon } from "./dashboard-icons";
import SupportUnreadIndicator from "./support-unread-indicator";
import {
  daysUntilExpiry,
  isSiteExpired,
  shouldShowExpirationWarning,
} from "@/lib/site-expiration";

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

const PLAN_TAG: Record<string, { cls: string; key: "planFree" | "planPaid" | "planTest" | "planExpired" }> = {
  "0": { cls: "free", key: "planFree" },
  "1": { cls: "pro", key: "planPaid" },
  "2": { cls: "test", key: "planTest" },
  "9": { cls: "expired", key: "planExpired" },
};

const THUMB_GRADIENTS = [
  ["#0a1630", "#1a3370"],
  ["#1f2940", "#3a4b7a"],
  ["#ff7a2b", "#ffe8d4"],
  ["#7b5cff", "#b89cff"],
  ["#18b368", "#a8e8c6"],
  ["#1c7bff", "#4fa3ff"],
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickGradient(seed: string): [string, string] {
  const g = THUMB_GRADIENTS[hashString(seed) % THUMB_GRADIENTS.length];
  return [g[0], g[1]];
}

function initialsFrom(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "?";
  // Take first two meaningful characters; letters + digits only
  const clean = trimmed.replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return trimmed.slice(0, 2).toUpperCase();
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

type TimeAgoT = (key: string, values?: Record<string, string | number>) => string;

function timeAgo(t: TimeAgoT, date: Date | null | undefined): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("timeAgoJustNow");
  if (min < 60) return t("timeAgoMin", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("timeAgoHr", { n: hr });
  const d = Math.floor(hr / 24);
  if (d < 7) return t("timeAgoDay", { n: d });
  const dt = new Date(date);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
}

function formatKRW(cents: number): string {
  if (cents >= 1_000_000) return `₩${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `₩${(cents / 1_000).toFixed(0)}K`;
  return `₩${cents.toLocaleString()}`;
}

/* ────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────── */

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [currentUser, emailVerificationEnabled, t] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true, email: true, credits: true, name: true },
    }),
    getSettingBool("emailVerificationEnabled"),
    getTranslations("dashboard"),
  ]);

  const credits = currentUser?.credits ?? 0;
  const displayName = currentUser?.name || (currentUser?.email?.split("@")[0] ?? "Guest");

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    include: {
      domains: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      pages: {
        select: { id: true, isHome: true, lang: true, updatedAt: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const siteIds = sites.map((s) => s.id);

  /* ── KPIs: compute from real tables where possible ── */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

  const [
    newOrders,
    prevOrders,
    recentOrders,
    unreadInquiries,
    recentInquiries,
    recentBookings,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        userId: session.user.id,
        orderType: "PRODUCT",
        createdAt: { gte: monthStart },
      },
      select: { id: true, totalAmount: true, status: true, createdAt: true, orderNumber: true, shippingName: true },
    }),
    prisma.order.count({
      where: {
        userId: session.user.id,
        orderType: "PRODUCT",
        createdAt: { gte: prevMonthStart, lt: monthStart },
      },
    }),
    prisma.order.findMany({
      where: { userId: session.user.id, orderType: "PRODUCT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, orderNumber: true, totalAmount: true, status: true, createdAt: true, shippingName: true,
        channel: true,
      },
    }),
    siteIds.length
      ? prisma.boardPost.count({
          where: {
            siteId: { in: siteIds },
            category: { legacyId: 13 }, // 견적문의 및 주문
            parentId: null,
          },
        })
      : Promise.resolve(0),
    /* 최근 문의 — legacyId 13 (견적문의) + 카테고리명에 "문의" 포함하는 게시글 */
    siteIds.length
      ? prisma.boardPost.findMany({
          where: {
            siteId: { in: siteIds },
            parentId: null,
            OR: [
              { category: { legacyId: 13 } },
              { category: { name: { contains: "문의" } } },
              { category: { name: { contains: "Inquiry", mode: "insensitive" } } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            legacyId: true, title: true, createdAt: true, siteId: true, author: true,
            category: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    /* 최근 예약 — 카테고리명에 "예약" / "booking" / "reservation" 포함 */
    siteIds.length
      ? prisma.boardPost.findMany({
          where: {
            siteId: { in: siteIds },
            parentId: null,
            OR: [
              { category: { name: { contains: "예약" } } },
              { category: { name: { contains: "booking", mode: "insensitive" } } },
              { category: { name: { contains: "reservation", mode: "insensitive" } } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            legacyId: true, title: true, createdAt: true, siteId: true, author: true,
            category: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const newOrderCount = newOrders.length;
  const monthRevenue = newOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const orderDelta = newOrderCount - prevOrders;

  // Filter counts for chips
  const byPlan = {
    all: sites.length,
    free: sites.filter((s) => s.accountType === "0").length,
    pro: sites.filter((s) => s.accountType === "1").length,
    expired: sites.filter((s) => isSiteExpired(s)).length,
  };

  // Expired/warning partitioning. We split by plan type because the
  // copy for a trial ending ("1개월 체험이 끝났어요, 유료 전환하세요")
  // is meaningfully different from a paid term lapsing ("운영 기간이
  // 만료됐어요, 기간연장하세요").
  const expiringSoonSites = sites.filter((s) =>
    shouldShowExpirationWarning(s)
  );
  const expiredAll = sites.filter((s) => isSiteExpired(s));
  const isFreePlan = (t: string) => {
    const k = String(t || "").toLowerCase();
    return k === "0" || k === "free";
  };
  const expiredTrial = expiredAll.filter((s) => isFreePlan(s.accountType));
  const expiredPaid = expiredAll.filter((s) => !isFreePlan(s.accountType));

  // Lookup map used by the booking/inquiry list panels for site name.
  const siteById = new Map(sites.map((s) => [s.id, s]));

  return (
    <>
      <ImpersonationBanner />
      {emailVerificationEnabled && !currentUser?.emailVerified && currentUser?.email !== "demo@demo.com" && (
        <EmailVerifyBanner
          email={currentUser?.email || ""}
          labels={{
            title: t("emailVerifyTitle"),
            message: t("emailVerifyMessage"),
            resend: t("emailVerifyResend"),
            sent: t("emailVerifySent"),
          }}
        />
      )}
      {await (async () => {
        if (expiredAll.length === 0 && expiringSoonSites.length === 0) return null;

        // Pick the banner variant by priority:
        //   · paid-expired first  (paying customer cut off — most urgent)
        //   · trial-expired       (trial ended, needs to convert to paid)
        //   · trial-expiring-soon (trial nearing 30d limit)
        // Within each, deep-link the CTA to the first affected site's
        // /extend page — the sites table below lists the rest.
        type Variant = "paid-expired" | "trial-expired" | "trial-warning";
        const variant: Variant =
          expiredPaid.length > 0 ? "paid-expired"
          : expiredTrial.length > 0 ? "trial-expired"
          : "trial-warning";
        const count =
          variant === "paid-expired" ? expiredPaid.length
          : variant === "trial-expired" ? expiredTrial.length
          : expiringSoonSites.length;
        const targetSite =
          variant === "paid-expired" ? expiredPaid[0]
          : variant === "trial-expired" ? expiredTrial[0]
          : expiringSoonSites[0];

        // Dismiss state — keyed by (variant, affected site ids) so a NEW
        // site expiring after dismissal still raises the banner. TTL 7d.
        const affectedIds =
          variant === "paid-expired" ? expiredPaid.map((s) => s.id)
          : variant === "trial-expired" ? expiredTrial.map((s) => s.id)
          : expiringSoonSites.map((s) => s.id);
        const dismissKey = `${variant}_${affectedIds.sort().join("-")}`;
        const cookieName = `hns_dismiss_expired_${dismissKey.replace(/[^a-z0-9_-]/gi, "_").slice(0, 120)}`;
        const cookieStore = await cookies();
        if (cookieStore.get(cookieName)?.value === "1") return null;

        const extendHref = `/dashboard/site/${targetSite.id}/extend`;

        const copy = {
          "paid-expired": {
            title: `운영 기간이 만료된 사이트가 ${count}개 있습니다.`,
            sub: "공개가 중지되었습니다. 기간연장으로 다시 공개하세요.",
            cta: "기간연장 →",
          },
          "trial-expired": {
            title: `무료 체험(1개월)이 종료된 사이트가 ${count}개 있습니다.`,
            sub: "유료 플랜으로 전환하면 바로 다시 공개됩니다.",
            cta: "유료 전환 →",
          },
          "trial-warning": {
            title: `무료 체험이 곧 종료되는 사이트가 ${count}개 있습니다.`,
            sub: "지금 유료 전환하면 중단 없이 계속 이용할 수 있습니다.",
            cta: "지금 전환 →",
          },
        }[variant];

        const isUrgent = variant !== "trial-warning";

        async function dismissBanner(formData: FormData) {
          "use server";
          const key = formData.get("cookieName") as string;
          if (!key || !/^hns_dismiss_expired_[a-z0-9_-]+$/i.test(key)) return;
          const store = await cookies();
          store.set(key, "1", {
            maxAge: 60 * 60 * 24 * 7,
            httpOnly: true,
            sameSite: "lax",
            path: "/",
          });
          const { revalidatePath } = await import("next/cache");
          revalidatePath("/dashboard");
        }

        return (
          <div
            style={{
              background: isUrgent ? "#fef2f2" : "#fffbeb",
              borderBottom: `1px solid ${isUrgent ? "#fecaca" : "#fde68a"}`,
              padding: "12px 20px",
              fontSize: 14,
              color: isUrgent ? "#991b1b" : "#92400e",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <b>{copy.title}</b>
              <span style={{ marginLeft: 8, opacity: 0.85 }}>{copy.sub}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link
                href={extendHref}
                style={{
                  padding: "8px 16px",
                  background: isUrgent ? "#dc2626" : "#d97706",
                  color: "#fff",
                  borderRadius: 6,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                {copy.cta}
              </Link>
              <form action={dismissBanner}>
                <input type="hidden" name="cookieName" value={cookieName} />
                <button
                  type="submit"
                  title="이 경고문구를 7일간 숨깁니다"
                  style={{
                    background: "transparent",
                    border: "0",
                    padding: "6px 10px",
                    color: isUrgent ? "#991b1b" : "#92400e",
                    opacity: 0.7,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    textDecoration: "underline",
                    whiteSpace: "nowrap",
                  }}
                >
                  다시 보지 않기
                </button>
              </form>
            </div>
          </div>
        );
      })()}
      <DashboardIconSprite />
      <div className="dv2-app">
        {/* ───── SIDEBAR ───── */}
        <aside className="dv2-side">
          <Link href="/dashboard" className="dv2-brand" title="대시보드로"><div className="dv2-brand-mark">h</div><div className="dv2-brand-name">home<span className="ns">Nshop</span></div></Link>

          <nav className="dv2-nav">
            <Link className="active" href="/dashboard">
              <span className="ic"><Icon id="i-home" /></span>
              <span className="label">{t("navAdminMain")}</span>
            </Link>
            <Link href="/dashboard/sites">
              <span className="ic"><Icon id="i-grid" /></span>
              <span className="label">{t("navMySites")}</span>
              {sites.length > 0 && <span className="badge">{sites.length}</span>}
            </Link>
            <a className="soon" aria-disabled="true">
              <span className="ic"><Icon id="i-analytics" /></span>
              <span className="label">{t("navAnalytics")}</span>
              <span className="soon-tag">{t("navSoonTag")}</span>
            </a>
            <Link href="/dashboard/orders">
              <span className="ic"><Icon id="i-bag" /></span>
              <span className="label">{t("navOrders")}</span>
              {newOrderCount > 0 && <span className="badge g">{newOrderCount}</span>}
            </Link>
            <Link href="/dashboard/boards">
              <span className="ic"><Icon id="i-mail" /></span>
              <span className="label">{t("navBoards")}</span>
              {unreadInquiries > 0 && <span className="badge">{unreadInquiries}</span>}
            </Link>
            <Link href="/dashboard/domains">
              <span className="ic"><Icon id="i-globe" /></span>
              <span className="label">{t("navDomains")}</span>
            </Link>
            <Link href="/dashboard/integrations">
              <span className="ic"><Icon id="i-link" /></span>
              <span className="label">{t("navIntegrations")}</span>
            </Link>
          </nav>

          <div className="dv2-side-section">
            <div className="dv2-side-label">{t("navSectionAccount")}</div>
            <nav className="dv2-nav">
              <Link href="/dashboard/credits">
                <span className="ic"><Icon id="i-credit" /></span>
                <span className="label">{t("navCredits")}</span>
              </Link>
              <Link href="/dashboard/profile">
                <span className="ic"><Icon id="i-settings" /></span>
                <span className="label">{t("navProfile")}</span>
              </Link>
              <Link href="/dashboard/support"><span className="ic"><Icon id="i-chat" /></span><span className="label">{t("navSupport")}</span><SupportUnreadIndicator variant="count" /></Link>
            </nav>
          </div>

          <div className="dv2-side-footer">
            <div className="dv2-coin-card">
              <div className="row">
                <div className="ball">C</div>
                <div>
                  <div className="num">
                    {credits.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>{t("coinLabel")}</span>
                  </div>
                  <div className="cap">{t("coinUsableForAI")}</div>
                </div>
              </div>
              <Link className="go" href="/dashboard/credits">
                {t("coinRecharge")} <Icon id="i-chev-right" size={12} />
              </Link>
            </div>
          </div>
        </aside>

        {/* ───── MAIN ───── */}
        <div className="dv2-main">
          {/* Topbar */}
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              <span>{t("breadcrumbHome")}</span>
              <span className="sep">/</span>
              <span className="cur">{t("navAdminMain")}</span>
            </div>
            <Link href="/dashboard/search" className="dv2-search" style={{ textDecoration: "none" }}>
              <Icon id="i-search" size={16} />
              <input placeholder={t("topbarSearch")} readOnly />
              <span className="kbd">⌘K</span>
            </Link>
            <div className="dv2-spacer" />
            <div className="dv2-topbar-actions">
              <Link className="dv2-coin-pill" href="/dashboard/credits" title="AI 제작 코인">
                <span className="ball">C</span>
                <span>{credits.toLocaleString()}</span>
                <span className="c">coin</span>
              </Link>
              <Link href="/dashboard/boards" className="dv2-icon-btn" title="알림">
                <Icon id="i-bell" size={17} />
                {unreadInquiries > 0 && <span className="dot" />}
              </Link>
              <Link href="/dashboard/support" className="dv2-icon-btn" title="도움말 · 지원" style={{ position: "relative" }}>
                <Icon id="i-chat" size={17} />
                <SupportUnreadIndicator variant="dot" />
              </Link>
              <Link href="/dashboard/profile" className="dv2-user" style={{ textDecoration: "none" }}>
                <div>
                  <div className="name">{displayName}</div>
                  <div className="role">{t("topbarRoleOwner")}</div>
                </div>
                <div className="dv2-avatar">{initialsFrom(displayName)}</div>
              </Link>
              <SignOutButton />
            </div>
          </div>

          {/* Content */}
          <div className="dv2-content">
            {/* Page head */}
            <div className="dv2-page-head">
              <div>
                <h1 className="dv2-page-title">{t("navAdminMain")}</h1>
                <div className="dv2-page-sub">
                  {t("mainGreetingHello", { name: displayName })} ·{" "}
                  {sites.length > 0
                    ? t("mainGreetingHasSites", { count: sites.length })
                    : t("mainGreetingEmpty")}
                </div>
              </div>
              <div className="dv2-chip-group">
                <button className="dv2-chip on">{t("filterAll")} <span className="n">{byPlan.all}</span></button>
                <button className="dv2-chip">{t("filterFree")} <span className="n">{byPlan.free}</span></button>
                <button className="dv2-chip">{t("filterPaid")} <span className="n">{byPlan.pro}</span></button>
                <button className="dv2-chip">{t("filterExpired")} <span className="n">{byPlan.expired}</span></button>
              </div>
            </div>

            {/* Stats */}
            <div className="dv2-stats">
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-users" size={12} /> {t("statManagedSites")}</div>
                <div className="val">{sites.length}<span className="unit">{t("statManagedSitesUnit")}</span></div>
                <div className="foot">
                  <span style={{ color: "var(--ink-3)" }}>
                    {t("statManagedSitesFoot", { paid: byPlan.pro, free: byPlan.free })}
                  </span>
                </div>
              </div>
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-bag" size={12} /> {t("statNewOrders")}</div>
                <div className="val">{newOrderCount}<span className="unit">{t("statNewOrdersUnit")}</span></div>
                <div className="foot">
                  {orderDelta > 0 ? (
                    <><span className="up">{t("statDeltaUp", { n: orderDelta })}</span><span style={{ color: "var(--ink-3)" }}>{t("statVsPrevMonth")}</span></>
                  ) : orderDelta < 0 ? (
                    <><span className="dn">{t("statDeltaDown", { n: Math.abs(orderDelta) })}</span><span style={{ color: "var(--ink-3)" }}>{t("statVsPrevMonth")}</span></>
                  ) : (
                    <span style={{ color: "var(--ink-3)" }}>{t("statDeltaSame")}</span>
                  )}
                </div>
              </div>
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-mail" size={12} /> {t("statInquiries")}</div>
                <div className="val">{unreadInquiries}<span className="unit">{t("statInquiriesUnit")}</span></div>
                <div className="foot">
                  <span style={{ color: "var(--ink-3)" }}>
                    {unreadInquiries > 0 ? t("statInquiriesNeedCheck") : t("statInquiriesAllSeen")}
                  </span>
                </div>
              </div>
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-credit" size={12} /> {t("statRevenue")}</div>
                <div className="val">{monthRevenue > 0 ? formatKRW(monthRevenue) : "—"}</div>
                <div className="foot">
                  <span style={{ color: "var(--ink-3)" }}>
                    {sites.length > 0 ? t("statRevenueFoot", { count: sites.length }) : t("statRevenueEmpty")}
                  </span>
                </div>
              </div>
            </div>

            {/* Sites Panel */}
            <section className="dv2-panel">
              <div className="dv2-panel-head">
                <h2>
                  {t("panelHomepageAccounts")}
                  <span className="count">{t("panelHomepageAccountsCount", { count: sites.length, total: Math.max(sites.length, 5) })}</span>
                </h2>
                <div className="tools">
                  <Link href="/dashboard/domains" className="dv2-tool-btn">
                    <Icon id="i-globe" size={14} /> {t("btnDomainsTool")}
                  </Link>
                </div>
              </div>

              {sites.length === 0 ? (
                <div className="dv2-empty">
                  <div className="t">{t("sitesEmptyTitle")}</div>
                  <div className="d">{t("sitesEmptyDesc")}</div>
                  <Link href="/dashboard/templates" className="dv2-row-btn primary">
                    {t("sitesBrowseTemplates")} <Icon id="i-chev-right" size={12} />
                  </Link>
                </div>
              ) : (
                <>
                  <div className="dv2-site-thead">
                    <div>{t("siteColHomepage")}</div>
                    <div>{t("siteColPlan")}</div>
                    <div>{t("siteColPages")}</div>
                    <div>{t("siteColLastModified")}</div>
                    <div className="right col-stat">{t("siteColManage")}</div>
                    <div />
                  </div>

                  <div className="dv2-site-list">
                    {sites.map((s) => {
                      const plan = PLAN_TAG[s.accountType] || PLAN_TAG["0"];
                      const isExpired = isSiteExpired(s);
                      const remainingDays = daysUntilExpiry(s);
                      const warnExpiry = shouldShowExpirationWarning(s);
                      const [gradA, gradB] = pickGradient(s.shopId);
                      const initials = initialsFrom(s.name || s.shopId);
                      const homePage =
                        s.pages.find((p) => p.isHome && p.lang === s.defaultLanguage) ||
                        s.pages.find((p) => p.isHome) ||
                        s.pages[0];
                      const lastModified = s.pages.reduce<Date>(
                        (acc, p) => (p.updatedAt > acc ? p.updatedAt : acc),
                        s.updatedAt,
                      );
                      const activeDomain = s.domains[0];
                      const publicUrl = activeDomain
                        ? `https://${activeDomain.domain}`
                        : `https://home.homenshop.com/${s.shopId}/`;
                      const publicLabel = activeDomain ? activeDomain.domain : `home.homenshop.com/${s.shopId}`;

                      return (
                        <div key={s.id} className="dv2-site-row">
                          <div className="dv2-site-main">
                            <div
                              className="dv2-site-thumb"
                              style={{ background: `linear-gradient(135deg, ${gradA}, ${gradB})` }}
                            >
                              {isExpired ? (
                                <span className="paused" />
                              ) : (
                                <span className="live" />
                              )}
                              {initials}
                            </div>
                            <div className="dv2-site-info">
                              <div className="dv2-site-name">
                                {s.name || s.shopId}
                              </div>
                              <div className="dv2-site-meta">
                                <span className="handle">@{s.shopId}</span>
                                <span className="dot" />
                                <a className="url" href={publicUrl} target="_blank" rel="noopener noreferrer">
                                  {publicLabel}
                                </a>
                                {!activeDomain && (
                                  <>
                                    <span className="dot" />
                                    <span className="warn">{t("siteWarnNoCustomDomain")}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            <span className={`dv2-plan-tag ${plan.cls}`}>{t(plan.key)}</span>
                            {s.accountType === "0" && remainingDays !== null && (
                              <span
                                className="dv2-expiry-chip"
                                style={{
                                  display: "inline-block",
                                  marginLeft: 6,
                                  padding: "2px 8px",
                                  borderRadius: 10,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: isExpired
                                    ? "#fee2e2"
                                    : warnExpiry
                                      ? "#fef3c7"
                                      : "#f1f5f9",
                                  color: isExpired
                                    ? "#b91c1c"
                                    : warnExpiry
                                      ? "#92400e"
                                      : "#64748b",
                                }}
                                title={t("siteExpiryDateTooltip", { date: s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "-" })}
                              >
                                {isExpired
                                  ? t("siteExpiryExpired")
                                  : remainingDays === 0
                                    ? t("siteExpiryToday")
                                    : t("siteExpiryDaysLeft", { days: remainingDays })}
                              </span>
                            )}
                          </div>
                          <div className="dv2-stat-mini">
                            <span className="n">{s.pages.length}</span>
                            <span className="muted"> {t("siteColPagesUnit")}</span>
                          </div>
                          <div className="dv2-since">
                            {timeAgo(t, lastModified)}
                            <span className="d">{s.defaultLanguage.toUpperCase()}</span>
                          </div>
                          <div className="dv2-row-actions col-stat">
                            <Link
                              href={homePage ? `/dashboard/site/pages/${homePage.id}/edit` : "/dashboard/site/pages"}
                              className="dv2-row-btn primary"
                            >
                              <Icon id="i-palette" size={13} /> {t("btnDesign")}
                            </Link>
                            <Link href={`/dashboard/site/${s.id}/manage`} className="dv2-row-btn">
                              <Icon id="i-database" size={13} /> {t("btnData")}
                            </Link>
                            <Link href={`/dashboard/site/settings?id=${s.id}`} className="dv2-row-btn">
                              <Icon id="i-info" size={13} /> {t("btnInfo")}
                            </Link>
                          </div>
                          <Link href={`/dashboard/site/settings?id=${s.id}`} className="dv2-kebab">
                            <Icon id="i-more" size={16} />
                          </Link>
                        </div>
                      );
                    })}

                    {/* Add row */}
                    <Link href="/dashboard/templates" className="dv2-site-row add">
                      <div className="dv2-add-inner">
                        <span className="plus"><Icon id="i-plus" size={14} /></span>
                        {t("sitesAddNew")}
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </section>

            {/* 주문 / 예약 / 문의 — 3-column list panels */}
            {sites.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 16,
                }}
              >
                {/* 최근 주문 */}
                <section className="dv2-panel">
                  <div className="dv2-panel-head">
                    <h2>
                      <Icon id="i-bag" size={14} /> {t("panelRecentOrders")}
                      <span className="count">{recentOrders.length}</span>
                    </h2>
                    <div className="tools">
                      <Link href="/dashboard/orders" style={{ color: "var(--brand)", fontSize: 12, fontWeight: 600 }}>
                        {t("seeAll")}
                      </Link>
                    </div>
                  </div>
                  {recentOrders.length === 0 ? (
                    <div className="dv2-empty">
                      <div className="d">{t("panelRecentOrdersEmpty")}</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {recentOrders.map((o) => (
                        <Link
                          key={o.id}
                          href={`/dashboard/orders/${o.id}`}
                          style={{
                            padding: "12px 20px",
                            borderTop: "1px solid var(--line-2)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            textDecoration: "none",
                            color: "var(--ink-0)",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {formatKRW(o.totalAmount)}
                              {o.shippingName ? ` · ${o.shippingName}` : ""}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                              {timeAgo(t, o.createdAt)} · #{o.orderNumber}
                            </div>
                          </div>
                          <Icon id="i-chev-right" size={14} />
                        </Link>
                      ))}
                    </div>
                  )}
                </section>

                {/* 최근 예약 */}
                <section className="dv2-panel">
                  <div className="dv2-panel-head">
                    <h2>
                      <Icon id="i-clock" size={14} /> {t("panelRecentBookings")}
                      <span className="count">{recentBookings.length}</span>
                    </h2>
                    <div className="tools">
                      <Link href="/dashboard/boards" style={{ color: "var(--brand)", fontSize: 12, fontWeight: 600 }}>
                        {t("seeAll")}
                      </Link>
                    </div>
                  </div>
                  {recentBookings.length === 0 ? (
                    <div className="dv2-empty">
                      <div className="d">{t("panelRecentBookingsEmpty")}</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {recentBookings.map((p) => {
                        const s = siteById.get(p.siteId);
                        return (
                          <Link
                            key={`${p.siteId}-${p.legacyId}`}
                            href={p.category ? `/dashboard/boards/${p.category.id}` : "/dashboard/boards"}
                            style={{
                              padding: "12px 20px",
                              borderTop: "1px solid var(--line-2)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              textDecoration: "none",
                              color: "var(--ink-0)",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 13,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {p.title || "(제목 없음)"}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                                {timeAgo(t, p.createdAt)}
                                {p.author ? ` · ${p.author}` : ""}
                                {s ? ` · ${s.name || s.shopId}` : ""}
                              </div>
                            </div>
                            <Icon id="i-chev-right" size={14} />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* 최근 문의 */}
                <section className="dv2-panel">
                  <div className="dv2-panel-head">
                    <h2>
                      <Icon id="i-mail" size={14} /> {t("panelRecentInquiries")}
                      <span className="count">{recentInquiries.length}</span>
                    </h2>
                    <div className="tools">
                      <Link href="/dashboard/boards" style={{ color: "var(--brand)", fontSize: 12, fontWeight: 600 }}>
                        {t("seeAll")}
                      </Link>
                    </div>
                  </div>
                  {recentInquiries.length === 0 ? (
                    <div className="dv2-empty">
                      <div className="d">{t("panelRecentInquiriesEmpty")}</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {recentInquiries.map((p) => {
                        const s = siteById.get(p.siteId);
                        return (
                          <Link
                            key={`${p.siteId}-${p.legacyId}`}
                            href={p.category ? `/dashboard/boards/${p.category.id}` : "/dashboard/boards"}
                            style={{
                              padding: "12px 20px",
                              borderTop: "1px solid var(--line-2)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              textDecoration: "none",
                              color: "var(--ink-0)",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 13,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {p.title || "(제목 없음)"}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                                {timeAgo(t, p.createdAt)}
                                {p.author ? ` · ${p.author}` : ""}
                                {s ? ` · ${s.name || s.shopId}` : ""}
                              </div>
                            </div>
                            <Icon id="i-chev-right" size={14} />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
