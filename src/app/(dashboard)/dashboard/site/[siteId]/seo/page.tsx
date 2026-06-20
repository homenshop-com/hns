import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SeoAuditPanel, { type AuditResultShape } from "@/components/SeoAuditPanel";
import { CREDIT_COSTS } from "@/lib/credits";
import DashboardShell from "../../../dashboard-shell";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";
import CopyButton from "../../settings/copy-button";
import SitemapRefreshButton from "../../settings/sitemap-refresh-button";
import SeoDashboardClient from "./seo-dashboard-client";
import VisibilityPanel from "./visibility-panel";
import { getLatestVisibilityRun } from "@/lib/ai-visibility";
import "../../../dashboard-v2.css";
import "../manage/manage-v2.css";
import "../../settings/settings-v2.css";
import "./seo-v2.css";

interface SeoPageProps {
  params: Promise<{ siteId: string }>;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};
const SEVERITY_LABEL: Record<string, string> = {
  critical: "심각",
  major: "주요",
  minor: "권장",
  info: "정보",
};

export default async function SeoDashboardPage({ params }: SeoPageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;
  const t = await getTranslations("settings");
  const ts = await getTranslations("siteSettings");
  const tDash = await getTranslations("dashboard");

  const scope = await getManageScope();
  const site = await prisma.site.findFirst({
    where: { id: siteId, ...(scope ? manageableSiteWhere(scope) : { userId: session.user.id }) },
    include: {
      domains: true,
      pages: {
        select: {
          id: true,
          isHome: true,
          lang: true,
          title: true,
          slug: true,
          sortOrder: true,
          seoAuditAt: true,
          seoAuditResult: true,
        },
        orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!site) redirect("/dashboard");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });
  const credits = currentUser?.credits ?? 0;
  const latestVisibilityRun = await getLatestVisibilityRun(site.id);

  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];
  const siteName = site.name || site.shopId;

  // Default-language pages drive the audit panel (avoid duplicate Home rows).
  const auditPages = site.pages
    .filter((p) => p.lang === site.defaultLanguage)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      isHome: p.isHome,
      lang: p.lang,
      seoAuditAt: p.seoAuditAt ? p.seoAuditAt.toISOString() : null,
      seoAuditResult: (p.seoAuditResult as AuditResultShape | null) ?? null,
    }));

  // ── Sitemap stats (mirrors settings page) ──
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
  const sitemapApiUrl = `https://homenshop.net/api/sitemap/${site.id}`;
  const sitemapCustomUrl = activeDomain ? `https://${activeDomain.domain}/sitemap.xml` : null;

  const gaConnected = Boolean(site.googleAnalyticsId);
  const gscConnected = Boolean(site.googleVerification);
  const seoConnectedCount = (gaConnected ? 1 : 0) + (gscConnected ? 1 : 0);

  // ── Overview aggregates ──
  const homeAudit =
    auditPages.find((p) => p.isHome)?.seoAuditResult ??
    auditPages.find((p) => p.seoAuditResult)?.seoAuditResult ??
    null;
  const overallScore = homeAudit?.overallScore ?? null;
  const diagnosedCount = auditPages.filter((p) => p.seoAuditResult).length;
  const structuredScore =
    homeAudit?.categories.find((c) => c.key === "structured_data")?.score ?? null;
  const topFindings = homeAudit
    ? homeAudit.categories
        .flatMap((c) => c.findings.map((f) => ({ ...f, cat: c.label })))
        .filter((f) => !f.appliedAt)
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
        .slice(0, 5)
    : [];

  const visRate = latestVisibilityRun ? latestVisibilityRun.mentionRate : null;

  const ringCirc = 2 * Math.PI * 40;
  const ringOffset = overallScore != null ? ringCirc * (1 - overallScore / 100) : ringCirc;
  const scoreColor =
    overallScore == null ? "#cbd2d9" : overallScore >= 80 ? "#16a34a" : overallScore >= 60 ? "#ba7517" : "#dc2626";

  // ═══════════════ SLOT: 개요 ═══════════════
  const overviewSlot = (
    <>
      <div className="seo-hero">
        <div className="seo-hero-ring">
          <svg viewBox="0 0 96 96" width={96} height={96} aria-hidden="true">
            <circle cx="48" cy="48" r="40" fill="none" stroke="#e5e8eb" strokeWidth="9" />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke={scoreColor}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 48 48)"
            />
          </svg>
          <div className="val">
            <b>{overallScore != null ? overallScore : "—"}</b>
            <small>/ 100</small>
          </div>
        </div>
        <div className="seo-hero-desc">
          <p className="h">통합 AI 가시성</p>
          <p className="p">
            검색엔진 노출(SEO)과 생성형 AI 인용(AEO·GEO)을 합산한 종합 지표입니다. 구조화 데이터 보완과
            AI 언급률 측정으로 점수를 높일 수 있습니다.
          </p>
        </div>
        <div className="seo-hero-stats">
          <div className="st">
            <div className="n" style={{ color: scoreColor }}>
              {overallScore != null ? overallScore : "—"}
            </div>
            <div className="l">SEO 진단</div>
          </div>
          <div className="st">
            <div className="n" style={{ color: visRate != null ? scoreColor : "#8b95a1" }}>
              {visRate != null ? `${visRate}%` : "—"}
            </div>
            <div className="l">AI 언급률</div>
          </div>
          <div className="st">
            <div className="n" style={{ color: sitemapUrlCount > 0 ? "#16a34a" : "#8b95a1" }}>
              {sitemapUrlCount > 0 ? "양호" : "—"}
            </div>
            <div className="l">색인 상태</div>
          </div>
        </div>
      </div>

      <div className="seo-cards">
        <div className="seo-card">
          <div className="lbl">
            <i className="fa-solid fa-stethoscope" aria-hidden="true" />
            SEO/GEO 진단
          </div>
          <div className="num">
            {overallScore != null ? overallScore : "미진단"}
            {overallScore != null && <small>/100</small>}
          </div>
          <div className="foot">
            {auditPages.length}개 페이지 중 {diagnosedCount}개 진단됨
          </div>
        </div>
        <div className="seo-card">
          <div className="lbl">
            <i className="fa-solid fa-quote-left" aria-hidden="true" />
            AI 언급률
          </div>
          <div className="num" style={{ color: visRate == null ? "#8b95a1" : undefined }}>
            {visRate != null ? <>{visRate}<small>%</small></> : "준비 중"}
          </div>
          <div className="foot link">
            {latestVisibilityRun
              ? `${latestVisibilityRun.mentionedCount}/${latestVisibilityRun.totalQueries} 질문 언급`
              : "측정 시작하기"}
          </div>
        </div>
        <div className="seo-card">
          <div className="lbl">
            <i className="fa-solid fa-sitemap" aria-hidden="true" />
            색인 URL
          </div>
          <div className="num">{sitemapUrlCount.toLocaleString()}</div>
          <div className="foot">
            {sitemapLastMod
              ? `sitemap 최종 ${new Date(sitemapLastMod).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}`
              : "sitemap 미생성"}
          </div>
        </div>
        <div className="seo-card">
          <div className="lbl">
            <i className="fa-solid fa-code" aria-hidden="true" />
            구조화 데이터
          </div>
          <div className="num" style={{ color: structuredScore != null && structuredScore < 60 ? "#ba7517" : undefined }}>
            {structuredScore != null ? structuredScore : "—"}
            {structuredScore != null && <small>/100</small>}
          </div>
          <div className="foot">{structuredScore != null ? "JSON-LD 진단 기준" : "진단 필요"}</div>
        </div>
      </div>

      <div className="seo-findings">
        <div className="hd">
          <p className="t">
            <i className="fa-solid fa-list-check" aria-hidden="true" style={{ color: "#3182f6" }} />
            우선 개선 항목
          </p>
        </div>
        {topFindings.length > 0 ? (
          topFindings.map((f, i) => (
            <div key={i} className="seo-find-row">
              <span className={`seo-sev ${f.severity}`}>{SEVERITY_LABEL[f.severity] ?? f.severity}</span>
              <span className="txt">{f.issue}</span>
              <span className="hint">{f.autofix ? "자동 적용 가능" : "수동 보완"}</span>
            </div>
          ))
        ) : (
          <div style={{ padding: "18px 0", fontSize: 13, color: "var(--ink-3, #8b95a1)", textAlign: "center" }}>
            아직 진단 결과가 없습니다. <b style={{ color: "var(--brand, #3182f6)" }}>진단 · 최적화</b> 탭에서
            AI 진단을 실행하세요.
          </div>
        )}
      </div>

      <div className="seo-chips">
        <div className={`seo-chip${gaConnected ? "" : " off"}`}>
          <i
            className={`fa-solid ${gaConnected ? "fa-circle-check" : "fa-triangle-exclamation"}`}
            aria-hidden="true"
            style={{ color: gaConnected ? "#16a34a" : "#ba7517" }}
          />
          Google Analytics {gaConnected ? "연결됨" : "미연결"}
        </div>
        <div className={`seo-chip${gscConnected ? "" : " off"}`}>
          <i
            className={`fa-solid ${gscConnected ? "fa-circle-check" : "fa-triangle-exclamation"}`}
            aria-hidden="true"
            style={{ color: gscConnected ? "#16a34a" : "#ba7517" }}
          />
          Search Console {gscConnected ? "연결됨" : "미연결"}
        </div>
        <div className="seo-chip">
          <i className="fa-solid fa-robot" aria-hidden="true" style={{ color: "#16a34a" }} />
          robots.txt · llms.txt 발행
        </div>
      </div>
    </>
  );

  // ═══════════════ SLOT: 진단 · 최적화 ═══════════════
  const auditSlot = (
    <SeoAuditPanel
      siteId={site.id}
      mode="user"
      costCredits={CREDIT_COSTS.AI_SEO_AUDIT}
      optimizeCostCredits={CREDIT_COSTS.AI_SEO_OPTIMIZE}
      balance={credits}
      pages={auditPages}
    />
  );

  // ═══════════════ SLOT: AI 언급률 ═══════════════
  const visibilitySlot = (
    <VisibilityPanel
      siteId={site.id}
      costCredits={CREDIT_COSTS.AI_VISIBILITY_CHECK}
      balance={credits}
      initialRun={latestVisibilityRun}
    />
  );

  // ═══════════════ SLOT: 색인 · 연동 ═══════════════
  const indexingSlot = (
    <section className="sv2-card ai">
      <div className="sv2-card-head">
        <div className="accent"></div>
        <h3>
          <svg width={16} height={16}>
            <use href="#i-google" />
          </svg>
          {ts("googleSeo")}
        </h3>
        <span className="status">
          <b style={{ color: seoConnectedCount === 2 ? "var(--ok)" : "var(--ink-3)" }}>{seoConnectedCount}</b>
          &nbsp;{ts("connectedCount")}
        </span>
      </div>
      <div className="sv2-card-body">
        <div className="sv2-grid" style={{ gap: 10 }}>
          <div className="sv2-integ-row">
            <div className="logo">
              <svg width={22} height={22}>
                <use href="#i-google" />
              </svg>
            </div>
            <div>
              <div className="nm">Google Analytics</div>
              <div className={`st ${gaConnected ? "ok" : "off"}`}>
                {gaConnected ? `${site.googleAnalyticsId} · ${ts("connected")}` : ts("notConnected")}
              </div>
            </div>
            <div className="ac">
              <Link
                href={`/dashboard/site/${site.id}/manage/config/analytics`}
                className={`sv2-tiny-btn${gaConnected ? "" : " primary"}`}
              >
                {gaConnected ? ts("manage") : ts("connect")}
              </Link>
            </div>
          </div>
          <div className="sv2-integ-row">
            <div className="logo">
              <svg width={22} height={22}>
                <use href="#i-google" />
              </svg>
            </div>
            <div>
              <div className="nm">Google Search Console</div>
              <div className={`st ${gscConnected ? "ok" : "off"}`}>
                {gscConnected ? ts("gscVerified", { count: sitemapUrlCount.toLocaleString() }) : ts("notConnected")}
              </div>
            </div>
            <div className="ac">
              <Link
                href={`/dashboard/site/${site.id}/manage/config/search-console`}
                className={`sv2-tiny-btn${gscConnected ? "" : " primary"}`}
              >
                {gscConnected ? ts("manage") : ts("connect")}
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
            {t("sitemapGuide")} {sitemapCustomUrl ? t("sitemapDomainHint") : t("sitemapNoDomainHint")}
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
  );

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: tDash("breadcrumbHome"), href: "/dashboard" },
        { label: siteName, href: `/dashboard/site/settings?id=${site.id}` },
        { label: "AI 최적화" },
      ]}
    >
      <div className="seo-page-head">
        <div>
          <h1 className="ttl">
            <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" style={{ color: "#6d28d9" }} />
            SEO · AEO · GEO 최적화
            <span className="badge-ai">AI</span>
          </h1>
          <div className="sub">검색엔진(SEO)과 생성형 AI(AEO·GEO) 노출을 한 곳에서 진단하고 최적화합니다.</div>
        </div>
        <Link href={`/dashboard/site/settings?id=${site.id}`} className="mv2-btn-secondary">
          <i className="fa-solid fa-circle-info" aria-hidden="true" style={{ marginRight: 6 }} />
          기본정보관리
        </Link>
      </div>

      <SeoDashboardClient
        overview={overviewSlot}
        audit={auditSlot}
        visibility={visibilitySlot}
        indexing={indexingSlot}
      />
    </DashboardShell>
  );
}
