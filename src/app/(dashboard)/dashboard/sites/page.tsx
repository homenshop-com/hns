import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import { Icon } from "../dashboard-icons";
import AICreateButton from "../ai-create-button";
import { getSettingBool } from "@/lib/settings";
import {
  daysUntilExpiry,
  isSiteExpired,
  shouldShowExpirationWarning,
} from "@/lib/site-expiration";

const PLAN_TAG: Record<string, { cls: string; label: string }> = {
  "0": { cls: "free", label: "무료계정" },
  "1": { cls: "pro", label: "유료계정" },
  "2": { cls: "test", label: "테스트" },
  "9": { cls: "expired", label: "만료" },
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

export default async function SitesPage() {
  const session = await auth();
  if (!session) redirect("/login");

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
      where: { userId: session.user.id, isTemplateStorage: false },
      include: {
        domains: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
        pages: {
          select: { id: true, isHome: true, lang: true, updatedAt: true },
          orderBy: { sortOrder: "asc" },
        },
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
        { label: "홈", href: "/dashboard" },
        { label: "내 홈페이지/쇼핑몰" },
      ]}
      badges={{ sites: sites.length }}
    >
      <div className="dv2-page-head">
        <div>
          <h1 className="dv2-page-title">내 홈페이지/쇼핑몰</h1>
          <div className="dv2-page-sub">
            현재 <b>{sites.length}개</b>의 홈앤샵 계정을 관리 중입니다. 각 계정마다 디자인,
            상품 데이터, 도메인을 독립적으로 설정할 수 있습니다.
          </div>
        </div>
        <div className="dv2-chip-group">
          <button className="dv2-chip on">전체 <span className="n">{byPlan.all}</span></button>
          <button className="dv2-chip">무료계정 <span className="n">{byPlan.free}</span></button>
          <button className="dv2-chip">유료계정 <span className="n">{byPlan.pro}</span></button>
          <button className="dv2-chip">만료계정 <span className="n">{byPlan.expired}</span></button>
        </div>
      </div>

      {/* Quick actions — moved here from main dashboard */}
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
            <div className="t">아직 홈페이지/쇼핑몰이 없습니다</div>
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
                const publicLabel = activeDomain
                  ? activeDomain.domain
                  : `home.homenshop.com/${s.shopId}`;

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
                        <div className="dv2-site-name">{s.name || s.shopId}</div>
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

              <Link href="/dashboard/templates" className="dv2-site-row add">
                <div className="dv2-add-inner">
                  <span className="plus"><Icon id="i-plus" size={14} /></span>
                  새 홈페이지/쇼핑몰 추가하기
                </div>
              </Link>
            </div>
          </>
        )}
      </section>

      {/* 별도 섹션: 마켓플레이스 연동 요약 + 전용 페이지 링크 */}
      <section className="dv2-panel" style={{ marginTop: 16 }}>
        <div className="dv2-panel-head">
          <h2>
            마켓플레이스 연동
            <span className="count">{integrationCount}개 ({activeIntegrationCount}개 활성)</span>
          </h2>
          <div className="tools">
            <Link href="/dashboard/integrations" className="dv2-tool-btn">
              <Icon id="i-link" size={14} /> 관리하기
            </Link>
          </div>
        </div>
        <div style={{ padding: "16px 20px", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.6 }}>
          홈앤샵 사이트와 별개로 외부 쇼핑몰(Shopify, 쿠팡, Amazon, Qoo10, Rakuten, TikTok Shop)에서
          판매 중인 셀러 계정을 연결해 주문을 한 곳에서 관리할 수 있습니다. 마켓 계정 추가/관리는{" "}
          <Link href="/dashboard/integrations" style={{ color: "var(--brand)", fontWeight: 600 }}>
            마켓플레이스 연동 페이지
          </Link>
          에서 진행합니다.
        </div>
      </section>
    </DashboardShell>
  );
}
