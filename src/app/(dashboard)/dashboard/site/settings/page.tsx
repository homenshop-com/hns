import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import EditSiteForm from "../edit-site-form";
import LanguageGridV2 from "./language-grid-v2";
import DeleteSiteButton from "./delete-site-button";
import SitemapRefreshButton from "./sitemap-refresh-button";
import CopyButton from "./copy-button";
import { DashboardIconSprite, Icon } from "../../dashboard-icons";
import { resolveExpiresAt, FREE_TRIAL_DAYS } from "@/lib/site-expiration";
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

  const params = await searchParams;
  const siteId = params.id;

  const site = siteId
    ? await prisma.site.findFirst({
        where: { id: siteId, userId: session.user.id },
        include: { domains: true, pages: { select: { id: true, isHome: true, lang: true } } },
      })
    : await prisma.site.findFirst({
        where: { userId: session.user.id, isTemplateStorage: false },
        include: { domains: true, pages: { select: { id: true, isHome: true, lang: true } } },
      });

  if (!site) redirect("/dashboard");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, credits: true },
  });

  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];

  // Sitemap stats (unchanged from previous version)
  const _activeLangs = new Set(siteLanguages.length ? siteLanguages : [site.defaultLanguage]);
  const _langArr = Array.from(_activeLangs);
  const _primaryLang = _activeLangs.has(site.defaultLanguage) ? site.defaultLanguage : _langArr[0];
  const _skipSlugs = new Set(["empty", "user", "users", "agreement"]);
  const [sitePages, sitemapCats, sitemapPostCount, sitemapProductCount] = await Promise.all([
    prisma.page.findMany({
      where: { siteId: site.id },
      select: { slug: true, lang: true, updatedAt: true },
    }),
    prisma.boardCategory.findMany({
      where: {
        siteId: site.id,
        lang: _primaryLang,
        NOT: { name: { in: ["Default", "New Category"] } },
      },
      select: { legacyId: true, _count: { select: { posts: { where: { parentId: null } } } } },
    }),
    prisma.boardPost.count({ where: { siteId: site.id, parentId: null, lang: _primaryLang } }),
    prisma.product.count({ where: { siteId: site.id } }),
  ]);
  const _eligiblePages = sitePages.filter(
    (p) => _activeLangs.has(p.lang) && !_skipSlugs.has(p.slug.toLowerCase()),
  );
  const _eligibleCats = sitemapCats.filter((c) => c.legacyId && c._count.posts > 0);
  const sitemapUrlCount =
    _eligiblePages.length +
    _eligibleCats.length * _langArr.length +
    sitemapPostCount * _langArr.length +
    sitemapProductCount * _langArr.length;
  const sitemapLastMod = _eligiblePages.length
    ? new Date(Math.max(..._eligiblePages.map((p) => p.updatedAt.getTime()))).toISOString()
    : null;

  const activeDomain = site.domains.find((d) => d.status === "ACTIVE");
  const publicUrl = activeDomain ? `https://${activeDomain.domain}` : `https://home.homenshop.com/${site.shopId}/${site.defaultLanguage}/`;
  const defaultUrlLabel = `home.homenshop.com/${site.shopId}/${site.defaultLanguage}/`;

  const sitemapApiUrl = `https://homenshop.com/api/sitemap/${site.id}`;
  const sitemapCustomUrl = activeDomain ? `https://${activeDomain.domain}/sitemap.xml` : null;

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "게스트";
  const credits = currentUser?.credits ?? 0;
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

  const gaConnected = Boolean(site.googleAnalyticsId);
  const gscConnected = Boolean(site.googleVerification);
  const seoConnectedCount = (gaConnected ? 1 : 0) + (gscConnected ? 1 : 0);

  return (
    <>
      <ImpersonationBanner />
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

          <Link href="/dashboard" className="mv2-site-switcher" title="홈페이지 전환">
            <div
              className="thumb"
              style={{
                background: `linear-gradient(135deg, ${thumbFrom}, ${thumbTo})`,
                color: thumbColor,
              }}
            >
              <span className="live" />
              {thumbLabel}
            </div>
            <div className="ss-info">
              <div className="ss-name">{siteName}</div>
              <div className="ss-url">{activeDomain ? activeDomain.domain : `home.homenshop.com/${site.shopId}`}</div>
            </div>
            <div className="ss-chev">
              <Icon id="i-chev-down" size={14} />
            </div>
          </Link>

          <nav className="dv2-nav">
            <Link href="/dashboard">
              <span className="ic"><Icon id="i-home" /></span>
              <span className="label">대시보드</span>
            </Link>
            <Link href={homePage ? `/dashboard/site/pages/${homePage.id}/edit` : "/dashboard/site/pages"}>
              <span className="ic"><Icon id="i-palette" /></span>
              <span className="label">디자인 관리</span>
            </Link>
            <Link href={`/dashboard/site/${site.id}/manage`}>
              <span className="ic"><Icon id="i-database" /></span>
              <span className="label">데이터 관리</span>
            </Link>
            <Link className="active" href={`/dashboard/site/settings?id=${site.id}`}>
              <span className="ic"><Icon id="i-info" /></span>
              <span className="label">기본정보 관리</span>
            </Link>
            <a className="soon" aria-disabled="true">
              <span className="ic"><Icon id="i-analytics" /></span>
              <span className="label">통계 · 분석</span>
              <span className="soon-tag">SOON</span>
            </a>
          </nav>

          <div className="dv2-side-section">
            <div className="dv2-side-label">계정</div>
            <nav className="dv2-nav">
              <Link href="/dashboard/credits">
                <span className="ic"><Icon id="i-credit" /></span>
                <span className="label">결제 · 크레딧</span>
              </Link>
              <Link href="/dashboard/profile">
                <span className="ic"><Icon id="i-user" /></span>
                <span className="label">관리자 정보</span>
              </Link>
              <Link href="/dashboard/support"><span className="ic"><Icon id="i-chat" /></span><span className="label">도움말 · 지원</span></Link>
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
                  <div className="cap">AI 제작 · 편집에 사용</div>
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
              <Link href="/dashboard">대시보드</Link>
              <span className="sep">/</span>
              <Link href={`/dashboard/site/settings?id=${site.id}`}>{siteName}</Link>
              <span className="sep">/</span>
              <span className="cur">기본정보 관리</span>
            </div>
            <div className="dv2-spacer" />
            <div className="dv2-topbar-actions">
              <Link className="dv2-coin-pill" href="/dashboard/credits" title="크레딧 잔액">
                <span className="ball">C</span>
                <span>{credits.toLocaleString()}</span>
                <span className="c">coin</span>
              </Link>
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

          {/* Screen tabs */}
          <div className="mv2-screen-tabs">
            <Link className="mv2-st" href={`/dashboard/site/${site.id}/manage`}>
              <Icon id="i-database" size={15} /> 데이터 관리
            </Link>
            <Link className="mv2-st on" href={`/dashboard/site/settings?id=${site.id}`}>
              <Icon id="i-info" size={15} /> 기본정보 관리
            </Link>
            <Link className="mv2-st" href="/dashboard/profile">
              <Icon id="i-user" size={15} /> 관리자 정보
            </Link>
          </div>

          <div className="dv2-content">
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
                  <Icon id="i-external" size={14} /> 사이트 열기
                </a>
              </div>
            </div>

            {/* Page head */}
            <div className="sv2-page-head">
              <h1 className="sv2-page-title">기본정보 관리</h1>
              <div className="sv2-page-sub">
                사이트 이름·설명·도메인·언어·분석 도구 등 사이트의 기본 정보를 설정합니다.
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
                  <span className="status ok"><b>{siteLanguages.length}</b>&nbsp;활성</span>
                </div>
                <div className="sv2-card-body">
                  <LanguageGridV2
                    siteId={site.id}
                    languages={siteLanguages}
                    defaultLanguage={site.defaultLanguage}
                  />
                </div>
              </section>

              {/* 3 — 커스텀 도메인 (blue) */}
              <section className="sv2-card blue">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <svg className="ic" width={16} height={16}><use href="#i-globe" /></svg>
                    {t("customDomain")}
                  </h3>
                  {activeDomain ? (
                    <span className="status ok">연결됨</span>
                  ) : site.domains.length > 0 ? (
                    <span className="status warn">대기중</span>
                  ) : null}
                </div>
                <div className="sv2-card-body">
                  {activeDomain ? (
                    <>
                      <div className="sv2-domain-row">
                        <span className="dot" />
                        <span className="host">{activeDomain.domain}</span>
                        {activeDomain.sslEnabled && <span className="sv2-ssl-tag">SSL</span>}
                        <Link href={`/dashboard/domains?siteId=${site.id}`} className="sv2-tiny-btn">
                          <svg width={11} height={11}><use href="#i-edit" /></svg>편집
                        </Link>
                      </div>
                      <div className="sv2-dns-rec">
                        <span className="k">A</span>
                        <span style={{ color: "var(--ink-3)" }}>@ →</span>
                        <span className="v">167.71.199.28</span>
                        <span style={{ color: "var(--ink-3)", marginLeft: "auto" }}>
                          {activeDomain.sslEnabled ? "✓ 전파 완료" : "⏳ 전파 중"}
                        </span>
                      </div>
                      <div className="sv2-links-row">
                        <Link href={`/dashboard/domains?siteId=${site.id}`} className="primary-link">
                          {t("domainManage")} →
                        </Link>
                        <span className="sep">·</span>
                        <a href="#" className="muted">DNS 설정 가이드</a>
                        <span className="sep">·</span>
                        <Link href={`/dashboard/domains?siteId=${site.id}`} className="muted">SSL 재발급</Link>
                      </div>
                    </>
                  ) : site.domains.length > 0 ? (
                    <>
                      {site.domains.map((d) => (
                        <div key={d.id} className="sv2-domain-row">
                          <span className="dot warn" />
                          <span className="host">{d.domain}</span>
                          <span style={{ fontSize: 11, color: "var(--warn)", fontWeight: 600 }}>{d.status}</span>
                        </div>
                      ))}
                      <Link href={`/dashboard/domains?siteId=${site.id}`} className="primary-link" style={{ fontSize: 12 }}>
                        {t("domainManage")} →
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="sv2-empty-domain">
                        <p style={{ margin: "0 0 8px" }}>{t("noDomains")}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)" }}>
                          커스텀 도메인 연결 시 브랜드 주소로 사이트를 운영할 수 있습니다.
                        </p>
                      </div>
                      <div className="sv2-links-row">
                        <Link href={`/dashboard/domains?siteId=${site.id}`} className="primary-link">
                          도메인 연결하기 →
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* 4 — 계정 정보 (slate) */}
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
                              무료 체험 {FREE_TRIAL_DAYS}일
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
                        <div className="tt">Pro 업그레이드로 더 많은 혜택</div>
                        <div className="sub">용량 10GB · AI 기능 · 커스텀 도메인 · 월 ₩9,900</div>
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

              {/* 5 — Google 설정 · SEO (ai, col-2) */}
              <section className="sv2-card ai col-2">
                <div className="sv2-card-head">
                  <div className="accent"></div>
                  <h3>
                    <svg width={16} height={16}><use href="#i-google" /></svg>
                    Google 설정 · SEO
                  </h3>
                  <span className="status">
                    <b style={{ color: seoConnectedCount === 2 ? "var(--ok)" : "var(--ink-3)" }}>
                      {seoConnectedCount}
                    </b>
                    &nbsp;/ 2 연결됨
                  </span>
                </div>
                <div className="sv2-card-body">
                  <div className="sv2-grid" style={{ gap: 10 }}>
                    <div className="sv2-integ-row">
                      <div className="logo"><svg width={22} height={22}><use href="#i-google" /></svg></div>
                      <div>
                        <div className="nm">Google Analytics</div>
                        <div className={`st ${gaConnected ? "ok" : "off"}`}>
                          {gaConnected
                            ? `${site.googleAnalyticsId} · 연결됨`
                            : "연결되지 않음"}
                        </div>
                      </div>
                      <div className="ac">
                        <Link
                          href={`/dashboard/site/${site.id}/manage/config/analytics`}
                          className={`sv2-tiny-btn${gaConnected ? "" : " primary"}`}
                        >
                          {gaConnected ? "관리" : "연결"}
                        </Link>
                      </div>
                    </div>
                    <div className="sv2-integ-row">
                      <div className="logo"><svg width={22} height={22}><use href="#i-google" /></svg></div>
                      <div>
                        <div className="nm">Google Search Console</div>
                        <div className={`st ${gscConnected ? "ok" : "off"}`}>
                          {gscConnected
                            ? `소유 확인 완료 · ${sitemapUrlCount.toLocaleString()} URL 색인`
                            : "연결되지 않음"}
                        </div>
                      </div>
                      <div className="ac">
                        <Link
                          href={`/dashboard/site/${site.id}/manage/config/search-console`}
                          className={`sv2-tiny-btn${gscConnected ? "" : " primary"}`}
                        >
                          {gscConnected ? "관리" : "연결"}
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Sitemap block */}
                  <div className="sv2-sitemap">
                    <h4>
                      <svg width={14} height={14} style={{ color: "var(--ai)" }}>
                        <use href="#i-sitemap" />
                      </svg>
                      {t("sitemap")}
                    </h4>
                    <div className="row">
                      <span className="k">{t("sitemapDefault")}</span>
                      <a className="v" href={sitemapApiUrl} target="_blank" rel="noopener noreferrer">
                        {sitemapApiUrl}
                      </a>
                      <CopyButton value={sitemapApiUrl} />
                    </div>
                    {sitemapCustomUrl && (
                      <div className="row">
                        <span className="k">{t("sitemapDomain")}</span>
                        <a className="v" href={sitemapCustomUrl} target="_blank" rel="noopener noreferrer">
                          {sitemapCustomUrl}
                        </a>
                        <CopyButton value={sitemapCustomUrl} />
                      </div>
                    )}
                    <div className="guide">
                      {t("sitemapGuide")}{" "}
                      {sitemapCustomUrl ? t("sitemapDomainHint") : t("sitemapNoDomainHint")}
                    </div>
                    <SitemapRefreshButton
                      siteId={site.id}
                      initialUrlCount={sitemapUrlCount}
                      initialLastModified={sitemapLastMod}
                      hasCustomDomain={Boolean(activeDomain)}
                    />
                  </div>
                </div>
              </section>

              {/* 6 — 계정 삭제 (danger, col-2) */}
              <section className="sv2-card danger col-2">
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
                    계정을 삭제하면 <b>모든 페이지·게시판·상품 데이터</b>가 영구적으로 삭제됩니다.
                    삭제 후 <b>30일간</b> 복구 요청이 가능하며, 그 이후에는 복구할 수 없습니다.
                  </div>
                  <DeleteSiteButton siteId={site.id} shopId={site.shopId} />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
