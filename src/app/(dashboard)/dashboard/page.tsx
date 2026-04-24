import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import SignOutButton from "./sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import EmailVerifyBanner from "./email-verify-banner";
import AICreateButton from "./ai-create-button";
import { getSettingBool } from "@/lib/settings";
import "./dashboard-v2.css";
import { DashboardIconSprite, Icon } from "./dashboard-icons";
import {
  daysUntilExpiry,
  isSiteExpired,
  shouldShowExpirationWarning,
} from "@/lib/site-expiration";

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

const PLAN_TAG: Record<string, { cls: string; label: string }> = {
  "0": { cls: "free", label: "무료계정" },
  "1": { cls: "pro", label: "유료계정" },
  "2": { cls: "test", label: "테스트" },
  "9": { cls: "expired", label: "만료" },
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

function koreanTimeAgo(date: Date | null | undefined): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}일 전`;
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

  const [currentUser, emailVerificationEnabled, t, tTpl] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true, email: true, credits: true, name: true },
    }),
    getSettingBool("emailVerificationEnabled"),
    getTranslations("dashboard"),
    getTranslations("templates"),
  ]);

  const credits = currentUser?.credits ?? 0;
  const displayName = currentUser?.name || (currentUser?.email?.split("@")[0] ?? "게스트");

  const aiLabels = {
    btnNewSiteAI: t("btnNewSiteAI"),
    aiModalTitle: t("aiModalTitle"),
    aiNotice1: t("aiNotice1"),
    aiNotice2: t("aiNotice2"),
    defaultLanguage: tTpl("defaultLanguage"),
    subdomainSetup: tTpl("subdomainSetup"),
    subdomainPrefix: tTpl("subdomainPrefix"),
    subdomainHint: tTpl("subdomainHint"),
    aiSiteTitle: t("aiSiteTitle"),
    aiSiteTitlePlaceholder: t("aiSiteTitlePlaceholder"),
    aiPrompt: t("aiPrompt"),
    aiPromptPlaceholder: t("aiPromptPlaceholder"),
    aiGenerate: t("aiGenerate"),
    aiGenerating: t("aiGenerating"),
    langKo: tTpl("langKo"),
    langEn: tTpl("langEn"),
    langZhCn: tTpl("langZhCn"),
    langJa: tTpl("langJa"),
    langZhTw: tTpl("langZhTw"),
    langEs: tTpl("langEs"),
    errorShopIdRequired: tTpl("errorShopIdRequired"),
    errorShopIdFormat: tTpl("errorShopIdFormat"),
    errorShopIdTaken: tTpl("errorShopIdTaken"),
    errorSiteTitleRequired: t("errorSiteTitleRequired"),
    errorPromptRequired: t("errorPromptRequired"),
    emailVerifyRequired: tTpl("emailVerifyRequired"),
    emailVerifyMessage: tTpl("emailVerifyMessage"),
    emailVerifyResend: tTpl("emailVerifyResend"),
    emailVerifySent: tTpl("emailVerifySent"),
  };
  const isEmailVerifiedForAI =
    !emailVerificationEnabled ||
    !!currentUser?.emailVerified ||
    currentUser?.email === "demo@demo.com";

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

  const [newOrders, prevOrders, recentOrders, unreadInquiries, recentPosts, allSiteTemplates] = await Promise.all([
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
    siteIds.length
      ? prisma.boardPost.findMany({
          where: {
            siteId: { in: siteIds },
            parentId: null,
          },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            legacyId: true, title: true, createdAt: true, siteId: true,
            category: { select: { name: true, legacyId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.template.count({ where: { isPublic: true } }),
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

  /* ── Derive activity feed: merge orders + board posts by date desc ── */
  type Activity = { kind: "order" | "board" | "edit"; when: Date; node: React.ReactNode };
  const activities: Activity[] = [];
  for (const o of recentOrders) {
    activities.push({
      kind: "order",
      when: o.createdAt,
      node: (
        <>
          <div className="dv2-a-title">
            새 주문 도착 · <b>{formatKRW(o.totalAmount)}</b>
            {o.shippingName ? ` · ${o.shippingName}` : ""}
          </div>
          <div className="dv2-a-sub">
            <span className="t">{koreanTimeAgo(o.createdAt)}</span>
            <span>·</span>
            <span className="mono">#{o.orderNumber}</span>
          </div>
        </>
      ),
    });
  }
  const siteById = new Map(sites.map((s) => [s.id, s]));
  for (const p of recentPosts) {
    const s = siteById.get(p.siteId);
    activities.push({
      kind: "board",
      when: p.createdAt,
      node: (
        <>
          <div className="dv2-a-title">
            <b>{s?.name || s?.shopId || "(사이트)"}</b>에 새 글
            {p.category?.name ? ` · ${p.category.name}` : ""}
            {": "}{p.title?.slice(0, 40) || "(제목 없음)"}
          </div>
          <div className="dv2-a-sub">
            <span className="t">{koreanTimeAgo(p.createdAt)}</span>
          </div>
        </>
      ),
    });
  }
  // Recent site edits (pages updatedAt)
  for (const s of sites.slice(0, 3)) {
    const lastPage = s.pages.reduce<{ updatedAt: Date } | null>((acc, p) => {
      if (!acc) return p;
      return p.updatedAt > acc.updatedAt ? p : acc;
    }, null);
    if (lastPage) {
      activities.push({
        kind: "edit",
        when: lastPage.updatedAt,
        node: (
          <>
            <div className="dv2-a-title">
              <b>{s.name || s.shopId}</b> 페이지 수정
            </div>
            <div className="dv2-a-sub">
              <span className="t">{koreanTimeAgo(lastPage.updatedAt)}</span>
              <span>·</span>
              <span className="mono">@{s.shopId}</span>
            </div>
          </>
        ),
      });
    }
  }
  activities.sort((a, b) => b.when.getTime() - a.when.getTime());
  const topActivities = activities.slice(0, 6);

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
          <div className="dv2-brand">
            <div className="dv2-brand-mark">h</div>
            <div className="dv2-brand-name">
              home<span className="ns">Nshop</span>
            </div>
          </div>

          <nav className="dv2-nav">
            <Link className="active" href="/dashboard">
              <span className="ic"><Icon id="i-home" /></span>
              <span className="label">관리자 메인</span>
            </Link>
            <Link href="/dashboard">
              <span className="ic"><Icon id="i-grid" /></span>
              <span className="label">내 홈페이지</span>
              {sites.length > 0 && <span className="badge">{sites.length}</span>}
            </Link>
            <a className="soon" aria-disabled="true">
              <span className="ic"><Icon id="i-analytics" /></span>
              <span className="label">통계 · 분석</span>
              <span className="soon-tag">SOON</span>
            </a>
            <Link href="/dashboard/orders">
              <span className="ic"><Icon id="i-bag" /></span>
              <span className="label">주문 관리</span>
              {newOrderCount > 0 && <span className="badge g">{newOrderCount}</span>}
            </Link>
            <Link href="/dashboard/boards">
              <span className="ic"><Icon id="i-mail" /></span>
              <span className="label">문의 · 예약</span>
              {unreadInquiries > 0 && <span className="badge">{unreadInquiries}</span>}
            </Link>
            <Link href="/dashboard/domains">
              <span className="ic"><Icon id="i-globe" /></span>
              <span className="label">도메인 관리</span>
            </Link>
          </nav>

          <div className="dv2-side-section">
            <div className="dv2-side-label">계정</div>
            <nav className="dv2-nav">
              <Link href="/dashboard/credits">
                <span className="ic"><Icon id="i-credit" /></span>
                <span className="label">결제 · 크레딧</span>
              </Link>
              <Link href="/dashboard/profile">
                <span className="ic"><Icon id="i-settings" /></span>
                <span className="label">관리자 정보</span>
              </Link>
              <a
                href="mailto:help@homenshop.com"
                className=""
              >
                <span className="ic"><Icon id="i-life" /></span>
                <span className="label">도움말 · 지원</span>
              </a>
            </nav>
          </div>

          <div className="dv2-side-footer">
            <div className="dv2-coin-card">
              <div className="row">
                <div className="ball">C</div>
                <div>
                  <div className="num">
                    {credits.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>coin</span>
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
          {/* Topbar */}
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              <span>홈</span>
              <span className="sep">/</span>
              <span className="cur">관리자 메인</span>
            </div>
            <Link href="/dashboard/search" className="dv2-search" style={{ textDecoration: "none" }}>
              <Icon id="i-search" size={16} />
              <input placeholder="홈페이지, 주문, 고객 검색…" readOnly />
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
              <a href="mailto:help@homenshop.com" className="dv2-icon-btn" title="도움말">
                <Icon id="i-help" size={17} />
              </a>
              <div className="dv2-lang">
                <LanguageSwitcher />
              </div>
              <Link href="/dashboard/profile" className="dv2-user" style={{ textDecoration: "none" }}>
                <div>
                  <div className="name">{displayName}</div>
                  <div className="role">Owner</div>
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
                <h1 className="dv2-page-title">관리자 메인</h1>
                <div className="dv2-page-sub">
                  안녕하세요, <b>{displayName}</b>님 ·{" "}
                  {sites.length > 0 ? (
                    <>현재 <b>{sites.length}개</b>의 홈페이지를 관리 중입니다.</>
                  ) : (
                    <>첫 홈페이지를 만들어 보세요.</>
                  )}
                </div>
              </div>
              <div className="dv2-chip-group">
                <button className="dv2-chip on">전체 <span className="n">{byPlan.all}</span></button>
                <button className="dv2-chip">무료계정 <span className="n">{byPlan.free}</span></button>
                <button className="dv2-chip">유료계정 <span className="n">{byPlan.pro}</span></button>
                <button className="dv2-chip">만료계정 <span className="n">{byPlan.expired}</span></button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="dv2-quick">
              <AICreateButton emailVerified={isEmailVerifiedForAI} labels={aiLabels} renderAsCard />
              <Link className="dv2-action tpl" href="/dashboard/templates">
                <div className="ai-bg" /><div className="glow" />
                <div className="inner">
                  <div className="ic"><Icon id="i-template" size={22} style={{ color: "#fff" }} /></div>
                  <div className="text">
                    <div className="ttl">템플릿 기반 제작 <span className="tag">{allSiteTemplates}+</span></div>
                    <div className="desc">업종별 검증된 디자인으로 시작</div>
                  </div>
                  <div className="arr"><Icon id="i-arr-right" size={20} /></div>
                </div>
              </Link>
              <Link className="dv2-action order" href="/dashboard/orders">
                <div className="ai-bg" /><div className="glow" />
                <div className="inner">
                  <div className="ic"><Icon id="i-handshake" size={22} style={{ color: "#fff" }} /></div>
                  <div className="text">
                    <div className="ttl">주문제작 의뢰 <span className="tag">PRO</span></div>
                    <div className="desc">전문 디자이너 1:1 매칭</div>
                  </div>
                  <div className="arr"><Icon id="i-arr-right" size={20} /></div>
                </div>
              </Link>
            </div>

            {/* Stats */}
            <div className="dv2-stats">
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-users" size={12} /> 관리 홈페이지</div>
                <div className="val">{sites.length}<span className="unit">개</span></div>
                <div className="foot">
                  <span style={{ color: "var(--ink-3)" }}>
                    유료 {byPlan.pro} · 무료 {byPlan.free}
                  </span>
                </div>
              </div>
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-bag" size={12} /> 이번 달 신규 주문</div>
                <div className="val">{newOrderCount}<span className="unit">건</span></div>
                <div className="foot">
                  {orderDelta > 0 ? (
                    <><span className="up">▲ {orderDelta}건</span><span style={{ color: "var(--ink-3)" }}>지난 달 대비</span></>
                  ) : orderDelta < 0 ? (
                    <><span className="dn">▼ {Math.abs(orderDelta)}건</span><span style={{ color: "var(--ink-3)" }}>지난 달 대비</span></>
                  ) : (
                    <span style={{ color: "var(--ink-3)" }}>지난 달 동일</span>
                  )}
                </div>
              </div>
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-mail" size={12} /> 견적 문의</div>
                <div className="val">{unreadInquiries}<span className="unit">개</span></div>
                <div className="foot">
                  <span style={{ color: "var(--ink-3)" }}>
                    {unreadInquiries > 0 ? "확인이 필요합니다" : "모두 확인됨"}
                  </span>
                </div>
              </div>
              <div className="dv2-stat">
                <div className="lbl"><Icon id="i-credit" size={12} /> 이번 달 매출</div>
                <div className="val">{monthRevenue > 0 ? formatKRW(monthRevenue) : "—"}</div>
                <div className="foot">
                  <span style={{ color: "var(--ink-3)" }}>
                    {sites.length > 0 ? `${sites.length}개 홈페이지 합산` : "홈페이지 추가 후 집계"}
                  </span>
                </div>
              </div>
            </div>

            {/* Sites Panel */}
            <section className="dv2-panel">
              <div className="dv2-panel-head">
                <h2>
                  홈페이지 계정
                  <span className="count">{sites.length} / {Math.max(sites.length, 5)}</span>
                </h2>
                <div className="tools">
                  <Link href="/dashboard/domains" className="dv2-tool-btn">
                    <Icon id="i-globe" size={14} /> 도메인
                  </Link>
                </div>
              </div>

              {sites.length === 0 ? (
                <div className="dv2-empty">
                  <div className="t">아직 홈페이지가 없습니다</div>
                  <div className="d">AI로 5분 만에 만들거나, 120+ 템플릿 중 선택하세요.</div>
                  <Link href="/dashboard/templates" className="dv2-row-btn primary">
                    템플릿 둘러보기 <Icon id="i-chev-right" size={12} />
                  </Link>
                </div>
              ) : (
                <>
                  <div className="dv2-site-thead">
                    <div>홈페이지</div>
                    <div>플랜</div>
                    <div>페이지</div>
                    <div>마지막 수정</div>
                    <div className="right col-stat">홈페이지 관리</div>
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
                                    <span className="warn">⚠ 커스텀 도메인 미연결</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            <span className={`dv2-plan-tag ${plan.cls}`}>{plan.label}</span>
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
                                title={`만료일: ${s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("ko-KR") : "-"}`}
                              >
                                {isExpired
                                  ? "만료됨"
                                  : remainingDays === 0
                                    ? "오늘 만료"
                                    : `${remainingDays}일 남음`}
                              </span>
                            )}
                          </div>
                          <div className="dv2-stat-mini">
                            <span className="n">{s.pages.length}</span>
                            <span className="muted"> 페이지</span>
                          </div>
                          <div className="dv2-since">
                            {koreanTimeAgo(lastModified)}
                            <span className="d">{s.defaultLanguage.toUpperCase()}</span>
                          </div>
                          <div className="dv2-row-actions col-stat">
                            <Link
                              href={homePage ? `/dashboard/site/pages/${homePage.id}/edit` : "/dashboard/site/pages"}
                              className="dv2-row-btn primary"
                            >
                              <Icon id="i-palette" size={13} /> 디자인
                            </Link>
                            <Link href={`/dashboard/site/${s.id}/manage`} className="dv2-row-btn">
                              <Icon id="i-database" size={13} /> 데이터
                            </Link>
                            <Link href={`/dashboard/site/settings?id=${s.id}`} className="dv2-row-btn">
                              <Icon id="i-info" size={13} /> 기본정보
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
                        새 홈페이지 추가하기
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </section>

            {/* Bottom grid */}
            {sites.length > 0 && (
              <div className="dv2-bottom">
                <section className="dv2-panel dv2-activity">
                  <div className="dv2-panel-head">
                    <h2>최근 활동</h2>
                    <div className="tools">
                      <Link href="/dashboard/orders" style={{ color: "var(--brand)", fontSize: 12, fontWeight: 600 }}>
                        모두 보기 →
                      </Link>
                    </div>
                  </div>
                  <div className="a-list">
                    {topActivities.length === 0 ? (
                      <div className="dv2-empty">
                        <div className="d">아직 활동 내역이 없습니다</div>
                      </div>
                    ) : (
                      topActivities.map((a, i) => (
                        <div key={i} className="dv2-a-item">
                          <div
                            className={`dv2-a-ic ${a.kind === "order" ? "order" : a.kind === "board" ? "board" : "edit"}`}
                          >
                            <Icon
                              id={a.kind === "order" ? "i-bag" : a.kind === "board" ? "i-mail" : "i-edit"}
                              size={15}
                            />
                          </div>
                          <div className="dv2-a-main">{a.node}</div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="dv2-panel">
                  <div className="dv2-panel-head">
                    <h2>추천 · 다음 단계</h2>
                  </div>
                  <div className="dv2-tips">
                    <Link href="/dashboard/templates" className="dv2-tip">
                      <div className="ic"><Icon id="i-sparkle" size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="tt">AI로 새 홈페이지 만들기</div>
                        <div className="sub">몇 문장만 입력하면 5분 만에 완성 · 50 코인</div>
                      </div>
                      <div className="go"><Icon id="i-chev-right" size={16} /></div>
                    </Link>
                    <Link href="/dashboard/domains" className="dv2-tip t2">
                      <div className="ic"><Icon id="i-globe" size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="tt">커스텀 도메인 연결하기</div>
                        <div className="sub">내 도메인으로 전문성 UP · SSL 자동 발급 무료</div>
                      </div>
                      <div className="go"><Icon id="i-chev-right" size={16} /></div>
                    </Link>
                    <Link href="/dashboard/credits" className="dv2-tip t3">
                      <div className="ic"><Icon id="i-credit" size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="tt">크레딧 충전하고 AI 편집 이어가기</div>
                        <div className="sub">현재 {credits.toLocaleString()}C 보유 · 스타터 팩 100C ₩5,500</div>
                      </div>
                      <div className="go"><Icon id="i-chev-right" size={16} /></div>
                    </Link>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
