import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../sign-out-button";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import EditSiteForm from "../edit-site-form";
import LanguageGridV2 from "./language-grid-v2";
import DeleteSiteButton from "./delete-site-button";
import { DashboardIconSprite, Icon } from "../../dashboard-icons";
import DashboardShell from "../../dashboard-shell";
import SupportUnreadIndicator from "../../support-unread-indicator";
import { resolveExpiresAt, FREE_TRIAL_DAYS } from "@/lib/site-expiration";
import { resolvePublicHost, TEMP_DOMAINS } from "@/lib/temp-domains";
import { getResellerForHost } from "@/lib/reseller";
import TempDomainSelect from "./temp-domain-select";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";
import QrCodeGenerator from "./qr-code-generator";
import "../../dashboard-v2.css";
import "../[siteId]/manage/manage-v2.css";
import "./settings-v2.css";

interface SettingsPageProps {
  searchParams: Promise<{ id?: string }>;
}

const SITE_THUMB_GRADS: Record<string, [string, string, string, string]> = {
  unionled:      ["#0a1630", "#1a3370", "#6fa0ff", "LED"],
  xunion5:       ["#1f2940", "#3a4b7a", "#ffffff", "X5"],
  bomnaldriving: ["#ffe8d4", "#ff9a5a", "#7c3a00", "🌸"],
};

function pickThumb(shopId: string): [string, string, string, string] {
  if (SITE_THUMB_GRADS[shopId]) return SITE_THUMB_GRADS[shopId];
  let h = 0;
  for (let i = 0; i < shopId.length; i++) h = ((h << 5) - h + shopId.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return [`hsl(${hue}, 40%, 22%)`, `hsl(${hue}, 45%, 40%)`, "#fff", shopId.slice(0, 2).toUpperCase()];
}

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

export default async function SiteSettingsPage({ searchParams }: SettingsPageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const t = await getTranslations("settings");
  const ts = await getTranslations("siteSettings");

  const params = await searchParams;
  const siteId = params.id;

  const _pageSelect = {
    id: true,
    isHome: true,
    lang: true,
    title: true,
    slug: true,
    sortOrder: true,
    seoAuditAt: true,
    seoAuditResult: true,
  } as const;

  const scope = await getManageScope();
  const site = siteId
    ? await prisma.site.findFirst({
        where: { id: siteId, ...(scope ? manageableSiteWhere(scope) : { userId: session.user.id }) },
        include: {
          domains: true,
          pages: { select: _pageSelect, orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }] },
        },
      })
    : await prisma.site.findFirst({
        where: { userId: session.user.id, isTemplateStorage: false },
        include: {
          domains: true,
          pages: { select: _pageSelect, orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }] },
        },
      });

  if (!site) redirect("/dashboard");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, credits: true },
  });

  // Reseller context (resolved once): on a white-label host, public URLs must
  // surface `home.{reseller domain}` instead of leaking `home.homenshop.com`.
  const reseller = await getResellerForHost();

  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];

  const activeDomain = site.domains.find((d) => d.status === "ACTIVE");
  const sTemp = resolvePublicHost(site, reseller);
  const publicUrl = activeDomain ? `https://${activeDomain.domain}` : `https://${sTemp}/${site.shopId}/${site.defaultLanguage}/`;
  const defaultUrlLabel = `${sTemp}/${site.shopId}/${site.defaultLanguage}/`;

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || ts("guest");
  const [thumbFrom, thumbTo, thumbColor, thumbLabel] = pickThumb(site.shopId);
  const siteName = site.name || site.shopId;

  const homePage =
    site.pages.find((p) => p.isHome && p.lang === site.defaultLanguage) ||
    site.pages.find((p) => p.isHome) ||
    site.pages[0];

  const accountLabels: Record<string, string> = {
    free: t("accountFree"),
    paid: t("accountPaid"),
    test: t("accountTest"),
    expired: t("accountExpired"),
  };
  const accountTypeKey = String(site.accountType || "free").toLowerCase();
  const planLabel = accountLabels[accountTypeKey] || site.accountType;
  const isPro = accountTypeKey === "paid" || accountTypeKey === "1";
  const isFreeType = accountTypeKey === "free" || accountTypeKey === "0";
  const isTrulyUnlimited = accountTypeKey === "test" || accountTypeKey === "2";

  // Derive expiry for free sites without stored expiresAt (legacy records).
  const effectiveExpiry = resolveExpiresAt(site);
  const isExpired =
    accountTypeKey === "expired" ||
    accountTypeKey === "9" ||
    (!!effectiveExpiry && effectiveExpiry < new Date());

  const createdAtLabel = new Date(site.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const expiresLabel = effectiveExpiry
    ? new Date(effectiveExpiry).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const isDerivedExpiry = isFreeType && !site.expiresAt && !!effectiveExpiry;

  const tDash = await getTranslations("dashboard");

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: tDash("breadcrumbHome"), href: "/dashboard" },
        { label: siteName, href: `/dashboard/site/settings?id=${site.id}` },
        { label: t("pageTitle") },
      ]}
    >
            {/* URL banner */}
            <div className="mv2-url-banner">
              <div className="mv2-url-left">
                <div className="lbl">
                  <Icon id="i-globe" size={12} /> {t("siteUrl")}
                </div>
                <div className="u">
                  <a className="main-url" href={`https://${defaultUrlLabel}`} target="_blank" rel="noopener noreferrer">
                    {defaultUrlLabel}
                  </a>
                  {activeDomain && (
                    <a
                      className="custom"
                      href={`https://${activeDomain.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {activeDomain.domain}{" "}
                      {activeDomain.sslEnabled && <span className="ssl">SSL</span>}
                    </a>
                  )}
                  {site.published && <span className="publish-chip">{t("published")}</span>}
                </div>
              </div>
              <div className="mv2-url-actions">
                <Link href={`/dashboard/site/${site.id}/manage/menus`} className="mv2-btn-secondary">
                  <Icon id="i-menu" size={14} /> {t("menuManage")}
                </Link>
                <a className="mv2-btn-secondary" href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <Icon id="i-external" size={14} /> {ts("openSite")}
                </a>
              </div>
            </div>

            {/* Page head */}
            <div className="sv2-page-head">
              <h1 className="sv2-page-title">{ts("pageHeading")}</h1>
              <div className="sv2-page-sub">
                {ts("pageHeadingSub")}
              </div>
            </div>

            {/* Grid */}
            <div className="sv2-grid">
              {/* 1 — 기본 정보 (orange) */}
              <section className="sv2-card orange">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <svg className="ic" width={16} height={16}><use href="#i-info" /></svg>
                    {t("basicInfo")}
                  </h3>
                </div>
                <EditSiteForm
                  site={{
                    id: site.id,
                    name: site.name,
                    description: site.description,
                    defaultLanguage: site.defaultLanguage,
                    availableLanguages: siteLanguages,
                  }}
                />
              </section>

              {/* 2 — 언어 설정 (green) */}
              <section className="sv2-card green">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <svg className="ic" width={16} height={16}><use href="#i-lang" /></svg>
                    {t("languageSettings")}
                  </h3>
                  <span className="status ok"><b>{siteLanguages.length}</b>&nbsp;{ts("active")}</span>
                </div>
                <div className="sv2-card-body">
                  <LanguageGridV2
                    siteId={site.id}
                    languages={siteLanguages}
                    defaultLanguage={site.defaultLanguage}
                  />
                </div>
              </section>

              {/* 3 — 도메인 (임시 + 커스텀 통합 — QR 생성기와 높이 매칭) */}
              <section className="sv2-card blue">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <svg className="ic" width={16} height={16}><use href="#i-globe" /></svg>
                    {ts("domain")}
                  </h3>
                  {activeDomain ? (
                    <span className="status ok">{ts("customConnected")}</span>
                  ) : site.domains.length > 0 ? (
                    <span className="status warn">{ts("pending")}</span>
                  ) : null}
                </div>
                <div className="sv2-card-body" style={{ gap: 18 }}>
                  {/* — 임시 도메인 서브섹션 — */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--ink-1)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      <i className="fa-solid fa-cloud" aria-hidden="true" style={{ fontSize: 11, color: "var(--ink-3)" }} />
                      {ts("tempDomain")}
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>
                      {ts("tempDomainDesc")}
                    </p>
                    <TempDomainSelect
                      siteId={site.id}
                      shopId={site.shopId}
                      defaultLanguage={site.defaultLanguage}
                      options={[...TEMP_DOMAINS]}
                      initialValue={sTemp}
                    />
                  </div>

                  <div style={{ height: 1, background: "var(--line, #e5e8eb)" }} />

                  {/* — 커스텀 도메인 서브섹션 — */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--ink-1)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      <i className="fa-solid fa-link" aria-hidden="true" style={{ fontSize: 11, color: "var(--ink-3)" }} />
                      {t("customDomain")}
                    </div>
                    {activeDomain ? (
                      <>
                        <div className="sv2-domain-row">
                          <span className="dot" />
                          <span className="host">{activeDomain.domain}</span>
                          {activeDomain.sslEnabled && <span className="sv2-ssl-tag">SSL</span>}
                          <Link href={`/dashboard/domains?siteId=${site.id}`} className="sv2-tiny-btn">
                            <svg width={11} height={11}><use href="#i-edit" /></svg>{ts("edit")}
                          </Link>
                        </div>
                        <div className="sv2-dns-rec">
                          <span className="k">A</span>
                          <span style={{ color: "var(--ink-3)" }}>@ →</span>
                          <span className="v">167.71.199.28</span>
                          <span style={{ color: "var(--ink-3)", marginLeft: "auto" }}>
                            {activeDomain.sslEnabled ? `✓ ${ts("propagationDone")}` : `⏳ ${ts("propagating")}`}
                          </span>
                        </div>
                        <div className="sv2-links-row">
                          <Link href={`/dashboard/domains?siteId=${site.id}`} className="primary-link">
                            {t("domainManage")} →
                          </Link>
                          <span className="sep">·</span>
                          <a href="#" className="muted">{ts("dnsGuide")}</a>
                          <span className="sep">·</span>
                          <Link href={`/dashboard/domains?siteId=${site.id}`} className="muted">{ts("sslReissue")}</Link>
                        </div>
                      </>
                    ) : site.domains.length > 0 ? (
                      <>
                        {site.domains.map((d) => (
                          <div key={d.id} className="sv2-domain-row">
                            <span className="dot warn" />
                            <span className="host">{d.domain}</span>
                            <span style={{ fontSize: 12.5, color: "var(--warn)", fontWeight: 600 }}>{d.status}</span>
                          </div>
                        ))}
                        <Link href={`/dashboard/domains?siteId=${site.id}`} className="primary-link" style={{ fontSize: 13.5, fontWeight: 600 }}>
                          {t("domainManage")} →
                        </Link>
                      </>
                    ) : (
                      <>
                        <div className="sv2-empty-domain">
                          <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "var(--ink-1)" }}>{t("noDomains")}</p>
                          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--ink-3)" }}>
                            {ts("noDomainsDesc")}
                          </p>
                        </div>
                        {/* 2026-05-17 사용자 요청: '도메인 연결하기' 텍스트 링크
                            → 명확한 Toss Blue 버튼으로 (커스텀 도메인 세팅 진입 CTA) */}
                        <div className="sv2-links-row" style={{ marginTop: 12 }}>
                          <Link
                            href={`/dashboard/domains?siteId=${site.id}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 7,
                              height: 40,
                              padding: "0 18px",
                              background: "#3182f6",
                              color: "#fff",
                              fontSize: 14,
                              fontWeight: 600,
                              borderRadius: 8,
                              textDecoration: "none",
                              boxShadow: "0 1px 2px rgba(49,130,246,0.25), 0 2px 6px rgba(49,130,246,0.18)",
                            }}
                          >
                            <i className="fa-solid fa-link" aria-hidden="true" style={{ fontSize: 12 }} />
                            {ts("connectDomain")}
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* 3b — QR 코드 생성기 (도메인 카드와 같은 행) */}
              <section className="sv2-card blue">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <i className="fa-solid fa-qrcode" aria-hidden="true" style={{ fontSize: 14, marginRight: 6 }} />
                    {ts("qrGenerator")}
                  </h3>
                </div>
                <div className="sv2-card-body">
                  <QrCodeGenerator
                    shopId={site.shopId}
                    defaultUrl={publicUrl}
                    alternateUrls={[
                      ...(activeDomain
                        ? [{ label: ts("tempUrl"), url: `https://${defaultUrlLabel}` }]
                        : []),
                    ]}
                  />
                </div>
              </section>

              {/* 5 — SEO·AEO·GEO 안내 배너 (기능은 전용 대시보드 /seo 로 이전) */}
              <section className="sv2-card ai col-2">
                <Link
                  href={`/dashboard/site/${site.id}/seo`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    textDecoration: "none",
                    padding: "16px 18px",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#6d28d9",
                      color: "#fff",
                      fontSize: 19,
                    }}
                  >
                    <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>
                      {ts("seoMovedTitle")}
                    </span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.5 }}>
                      {ts("seoMovedDesc")}
                    </span>
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 38,
                      padding: "0 16px",
                      background: "#6d28d9",
                      color: "#fff",
                      fontSize: 13.5,
                      fontWeight: 600,
                      borderRadius: 9,
                    }}
                  >
                    {ts("seoMovedCta")} <i className="fa-solid fa-arrow-right" aria-hidden="true" style={{ fontSize: 11 }} />
                  </span>
                </Link>
              </section>

              {/* 6a — 계정 정보 (slate, 하단 좌측) */}
              <section className="sv2-card slate">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <svg className="ic" width={16} height={16}><use href="#i-credit" /></svg>
                    {t("accountInfo")}
                  </h3>
                </div>
                <div className="sv2-card-body" style={{ gap: 0 }}>
                  <div className="sv2-info-row">
                    <span className="k">{t("accountType")}</span>
                    <span className="v">
                      <span className={isPro ? "pro-tag" : isExpired ? "expired-tag" : "free-tag"}>
                        {(isPro ? "PRO" : isExpired ? "EXPIRED" : "FREE")}
                      </span>
                      <span style={{ marginLeft: 6, fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>
                        {planLabel}
                      </span>
                    </span>
                  </div>
                  <div className="sv2-info-row">
                    <span className="k">{t("createdAt")}</span>
                    <span className="v">{createdAtLabel}</span>
                  </div>
                  <div className="sv2-info-row">
                    <span className="k">{t("expiresAt")}</span>
                    <span className="v">
                      {isTrulyUnlimited ? (
                        <span className="infinity">∞ {t("unlimited")}</span>
                      ) : expiresLabel ? (
                        <>
                          <span style={{ color: isExpired ? "var(--danger)" : undefined }}>{expiresLabel}</span>
                          {isDerivedExpiry && (
                            <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 500, marginTop: 2 }}>
                              {ts("freeTrialDays", { days: FREE_TRIAL_DAYS })}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="infinity">∞ {t("unlimited")}</span>
                      )}
                    </span>
                  </div>
                  {!isPro && (
                    <div className="sv2-upgrade">
                      <div className="ic"><Icon id="i-sparkle" size={17} /></div>
                      <div>
                        <div className="tt">{ts("proUpgradeTitle")}</div>
                        <div className="sub">{ts("proUpgradeSub")}</div>
                      </div>
                      <Link href={`/dashboard/site/${site.id}/extend`} className="cta">
                        {t("extend")} <Icon id="i-chev-right" size={12} />
                      </Link>
                    </div>
                  )}
                  {isPro && (
                    <div style={{ marginTop: 6 }}>
                      <Link
                        href={`/dashboard/site/${site.id}/extend`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12.5,
                          color: "var(--brand)",
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        {t("extend")} →
                      </Link>
                    </div>
                  )}
                </div>
              </section>

              {/* 6b — 계정 삭제 (danger, 하단 우측 — 계정 정보 옆) */}
              <section className="sv2-card danger">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3 style={{ color: "var(--danger)" }}>
                    <svg className="ic" width={16} height={16} style={{ color: "var(--danger)" }}>
                      <use href="#i-warn" />
                    </svg>
                    {t("deleteAccount")}
                  </h3>
                </div>
                <div className="sv2-danger-body">
                  <div className="txt">
                    {ts.rich("deleteWarning", { b: (c) => <b>{c}</b> })}
                  </div>
                  <DeleteSiteButton siteId={site.id} shopId={site.shopId} />
                </div>
              </section>
            </div>
    </DashboardShell>
  );
}
