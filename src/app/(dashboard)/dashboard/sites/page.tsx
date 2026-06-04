import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import { Icon } from "../dashboard-icons";
import AICreateButton from "../ai-create-button";
import CloneSiteControl from "./clone-site-control";
import { getSettingBool } from "@/lib/settings";
import { canAccessIntegrations } from "@/lib/feature-flags";
import {
  daysUntilExpiry,
  isSiteExpired,
  shouldShowExpirationWarning,
} from "@/lib/site-expiration";
import { getTempDomain } from "@/lib/temp-domains";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";

const PLAN_TAG: Record<string, { cls: string; key: "planFree" | "planPaid" | "planTest" | "planExpired" }> = {
  "0": { cls: "free", key: "planFree" },
  "1": { cls: "pro", key: "planPaid" },
  "2": { cls: "test", key: "planTest" },
  "9": { cls: "expired", key: "planExpired" },
};

const THUMB_GRADIENTS: [string, string][] = [
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
  return THUMB_GRADIENTS[hashString(seed) % THUMB_GRADIENTS.length];
}
function initialsFrom(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "?";
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

export default async function SitesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // 리셀러는 본인 사이트 + 귀속 고객 사이트를 모두 관리 — 메인 대시보드와
  // 동일하게 manageableSiteWhere 로 하위 계정까지 리스트한다. 일반 회원은
  // 본인 사이트만 조회된다.
  const manageScope = (await getManageScope()) ?? {
    userId: session.user.id,
    resellerId: null,
  };

  const [
    currentUser,
    emailVerificationEnabled,
    t,
    tTpl,
    sites,
    integrationCount,
    activeIntegrationCount,
    allSiteTemplates,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true, email: true },
    }),
    getSettingBool("emailVerificationEnabled"),
    getTranslations("dashboard"),
    getTranslations("templates"),
    prisma.site.findMany({
      where: { ...manageableSiteWhere(manageScope), isTemplateStorage: false },
      include: {
        domains: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
        pages: {
          select: { id: true, isHome: true, lang: true, updatedAt: true },
          orderBy: { sortOrder: "asc" },
        },
        user: { select: { email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.marketplaceIntegration.count({ where: { userId: session.user.id } }),
    prisma.marketplaceIntegration.count({
      where: { userId: session.user.id, status: "ACTIVE" },
    }),
    prisma.template.count({ where: { isPublic: true } }),
  ]);

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
    aiStyleStep: t("aiStyleStep"),
    aiInfoStep: t("aiInfoStep"),
    aiStyleTitle: t("aiStyleTitle"),
    aiStyleDesc: t("aiStyleDesc"),
    aiStyleNext: t("aiStyleNext"),
    aiStyleBack: t("aiStyleBack"),
    aiStyleAuto: t("aiStyleAuto"),
    aiStyleAutoDesc: t("aiStyleAutoDesc"),
    aiStyleMinimal: t("aiStyleMinimal"),
    aiStyleMinimalDesc: t("aiStyleMinimalDesc"),
    aiStyleEditorial: t("aiStyleEditorial"),
    aiStyleEditorialDesc: t("aiStyleEditorialDesc"),
    aiStyleOrganic: t("aiStyleOrganic"),
    aiStyleOrganicDesc: t("aiStyleOrganicDesc"),
    aiStyleLuxury: t("aiStyleLuxury"),
    aiStyleLuxuryDesc: t("aiStyleLuxuryDesc"),
    aiStyleColorful: t("aiStyleColorful"),
    aiStyleColorfulDesc: t("aiStyleColorfulDesc"),
    aiZipDivider: t("aiZipDivider"),
    aiZipTitle: t("aiZipTitle"),
    aiZipDesc: t("aiZipDesc"),
    aiZipNamePlaceholder: t("aiZipNamePlaceholder"),
    aiZipDropHint: t("aiZipDropHint"),
    aiZipFileHint: t("aiZipFileHint"),
    aiZipUpload: t("aiZipUpload"),
    aiZipUploading: t("aiZipUploading"),
    aiZipNameRequired: t("aiZipNameRequired"),
    aiZipFileRequired: t("aiZipFileRequired"),
  };
  const isEmailVerifiedForAI =
    !emailVerificationEnabled ||
    !!currentUser?.emailVerified ||
    currentUser?.email === "demo@demo.com";

  const byPlan = {
    all: sites.length,
    free: sites.filter((s) => s.accountType === "0").length,
    pro: sites.filter((s) => s.accountType === "1").length,
    expired: sites.filter((s) => isSiteExpired(s)).length,
  };

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("sitesPageTitle") },
      ]}
      badges={{ sites: sites.length }}
    >
      <div className="dv2-page-head">
        <div>
          <h1 className="dv2-page-title">{t("sitesPageTitle")}</h1>
          <div className="dv2-page-sub">
            {t("sitesPageSubtitle", { count: sites.length })}
          </div>
        </div>
        <div className="dv2-chip-group">
          <button className="dv2-chip on">{t("filterAll")} <span className="n">{byPlan.all}</span></button>
          <button className="dv2-chip">{t("filterFree")} <span className="n">{byPlan.free}</span></button>
          <button className="dv2-chip">{t("filterPaid")} <span className="n">{byPlan.pro}</span></button>
          <button className="dv2-chip">{t("filterExpired")} <span className="n">{byPlan.expired}</span></button>
        </div>
      </div>

      {/* 2026-05-17 사용자 요청: 홈페이지 계정 리스트를 상단으로, AI/템플릿/
          주문제작 의뢰 카드는 하단으로 순서 교체. 기존 사이트 관리가 1차
          작업이고 신규 사이트 생성 옵션은 보조 액션이므로 자연스러운 흐름. */}
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
                // 리셀러가 관리하는 고객 사이트(본인 소유 아님) — 보라색 "고객" 배지.
                const isCustomer = s.userId !== session.user.id;
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
                const sTemp = getTempDomain(s);
                const publicUrl = activeDomain
                  ? `https://${activeDomain.domain}`
                  : `https://${sTemp}/${s.shopId}/`;
                const publicLabel = activeDomain
                  ? activeDomain.domain
                  : `${sTemp}/${s.shopId}`;

                return (
                  <div key={s.id} className="dv2-site-row">
                    <div className="dv2-site-main">
                      <div
                        className="dv2-site-thumb"
                        style={{ background: `linear-gradient(135deg, ${gradA}, ${gradB})` }}
                      >
                        {isExpired ? <span className="paused" /> : <span className="live" />}
                        {initials}
                      </div>
                      <div className="dv2-site-info">
                        <div className="dv2-site-name">
                          {s.name || s.shopId}
                          {isCustomer && (
                            <span
                              title={t("siteCustomerBadgeTooltip", { email: s.user?.email ?? "" })}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                marginLeft: 8,
                                padding: "1px 8px",
                                borderRadius: 10,
                                fontSize: 11,
                                fontWeight: 700,
                                verticalAlign: "middle",
                                background: "#f5f3ff",
                                color: "#6d28d9",
                              }}
                            >
                              <i className="fa-solid fa-user-tag" style={{ fontSize: 10 }} />
                              {t("siteCustomerBadge")}
                            </span>
                          )}
                        </div>
                        <div className="dv2-site-meta">
                          <span className="handle">@{s.shopId}</span>
                          {isCustomer && s.user?.email && (
                            <>
                              <span className="dot" />
                              <span className="handle">{s.user.email}</span>
                            </>
                          )}
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
                    {/* 2026-05-17 사용자 보고: 임시도메인+뱃지 겹침.
                        세로 스택으로 변경 — dashboard-v2.css .dv2-site-plan-cell 참조 */}
                    <div className="dv2-site-plan-cell">
                      <span className={`dv2-plan-tag ${plan.cls}`}>{t(plan.key)}</span>
                      {s.accountType === "0" && remainingDays !== null && (
                        <span
                          className="dv2-expiry-chip"
                          style={{
                            display: "inline-block",
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
                      {/* 2026-06-04 사용자 요청: 리셀러는 대시보드에서도 계정
                          100% 복제 가능. 일반 회원에는 미노출(과금 이슈) —
                          API도 manageScope.resellerId 로 게이트. */}
                      {manageScope.resellerId && (
                        <CloneSiteControl
                          siteId={s.id}
                          shopId={s.shopId}
                          name={s.name || s.shopId}
                        />
                      )}
                    </div>
                    <Link href={`/dashboard/site/settings?id=${s.id}`} className="dv2-kebab">
                      <Icon id="i-more" size={16} />
                    </Link>
                  </div>
                );
              })}

              {/* 2026-05-19 사용자 요청: + 새 홈페이지/쇼핑몰 추가 행 제거.
                  이 페이지 하단의 AI/템플릿/주문제작 CTA 카드가 동일 역할을
                  더 풍부하게 제공하므로 중복. */}
            </div>
          </>
        )}
      </section>

      {/* Quick actions — 사이트 리스트 아래로 이동 (2026-05-17 사용자 요청).
          신규 사이트 추가/AI 제작/주문제작은 보조 액션 흐름. */}
      <div className="dv2-quick" style={{ marginTop: 16 }}>
        <AICreateButton emailVerified={isEmailVerifiedForAI} labels={aiLabels} renderAsCard />
        <Link className="dv2-action tpl" href="/dashboard/templates">
          <div className="ai-bg" /><div className="glow" />
          <div className="inner">
            <div className="ic"><Icon id="i-template" size={22} style={{ color: "#fff" }} /></div>
            <div className="text">
              <div className="ttl">{t("btnNewSite")} <span className="tag">{allSiteTemplates}+</span></div>
              <div className="desc">{tTpl("breadcrumbTemplates")}</div>
            </div>
            <div className="arr"><Icon id="i-arr-right" size={20} /></div>
          </div>
        </Link>
        <Link className="dv2-action order" href="/dashboard/orders">
          <div className="ai-bg" /><div className="glow" />
          <div className="inner">
            <div className="ic"><Icon id="i-handshake" size={22} style={{ color: "#fff" }} /></div>
            <div className="text">
              <div className="ttl">{t("btnCustomOrder")} <span className="tag">PRO</span></div>
              <div className="desc">1:1</div>
            </div>
            <div className="arr"><Icon id="i-arr-right" size={20} /></div>
          </div>
        </Link>
      </div>

      {/* 별도 섹션: 마켓플레이스 연동 요약 + 전용 페이지 링크 */}
      {canAccessIntegrations(currentUser?.email) && (
        <section className="dv2-panel" style={{ marginTop: 16 }}>
          <div className="dv2-panel-head">
            <h2>
              {t("panelMarketplaceIntegrations")}
              <span className="count">{t("panelMarketplaceCount", { count: integrationCount, active: activeIntegrationCount })}</span>
            </h2>
            <div className="tools">
              <Link href="/dashboard/integrations" className="dv2-tool-btn">
                <Icon id="i-link" size={14} /> {t("panelMarketplaceManage")}
              </Link>
            </div>
          </div>
          <div style={{ padding: "16px 20px", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.6 }}>
            {t("panelMarketplaceDesc")}
            <Link href="/dashboard/integrations" style={{ color: "var(--brand)", fontWeight: 600 }}>
              {t("panelMarketplaceLinkText")}
            </Link>
            {t("panelMarketplaceDescTail")}
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
