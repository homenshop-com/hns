import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import AddDomainForm from "./add-domain-form";
import ProvisionSslButton from "./provision-ssl-button";
import DeleteDomainForm from "./delete-domain-form";
import { DashboardIconSprite, Icon } from "../dashboard-icons";
import "../dashboard-v2.css";
import "../site/[siteId]/manage/manage-v2.css";
import "./domains-v2.css";

interface DomainsPageProps {
  searchParams: Promise<{ siteId?: string }>;
}

const SITE_THUMB_GRADS: Record<string, [string, string, string, string]> = {
  unionled:      ["#0a1630", "#1a3370", "#6fa0ff", "LED"],
  xunion5:       ["#1f2940", "#3a4b7a", "#ffffff", "X5"],
  bomnaldriving: ["#ffe8d4", "#ff9a5a", "#7c3a00", "봄"],
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

function daysBetween(future: Date, now: Date) {
  const ms = future.getTime() - now.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export default async function DashboardDomainsPage({ searchParams }: DomainsPageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const t = await getTranslations("domainsPage");

  const params = await searchParams;
  const siteIdFilter = params.siteId;

  const filteredSite = siteIdFilter
    ? await prisma.site.findFirst({
        where: { id: siteIdFilter, userId: session.user.id },
        select: { id: true, name: true, shopId: true },
      })
    : null;
  const effectiveSiteId = filteredSite?.id ?? null;

  const [domains, userSites, currentUser] = await Promise.all([
    prisma.domain.findMany({
      where: {
        userId: session.user.id,
        ...(effectiveSiteId ? { siteId: effectiveSiteId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        site: { select: { id: true, name: true, shopId: true } },
      },
    }),
    prisma.site.findMany({
      where: { userId: session.user.id, isTemplateStorage: false },
      select: { id: true, name: true, shopId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, credits: true },
    }),
  ]);

  // Stats
  const totalCount = domains.length;
  const activeCount = domains.filter((d) => d.status === "ACTIVE").length;
  const sslCount = domains.filter((d) => d.sslEnabled).length;
  const now = new Date();
  // Domain registry expiration is not tracked in our DB — we estimate "time
  // until renewal" as (registered_at + 365 days) for display purposes only.
  // Actual expiry lives at the registrar.
  function estimatedExpiry(createdAt: Date) {
    const d = new Date(createdAt);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const longestDays = domains
    .map((d) => daysBetween(estimatedExpiry(d.createdAt), now))
    .reduce((max, n) => Math.max(max, n), 0);

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "게스트";
  const credits = currentUser?.credits ?? 0;

  // Sidebar context: if filtered to a site, show that site; else show a generic account view
  const sidebarSite = filteredSite
    ? userSites.find((s) => s.id === filteredSite.id) || null
    : userSites[0] || null;

  const [thumbFrom, thumbTo, thumbColor, thumbLabel] = sidebarSite
    ? pickThumb(sidebarSite.shopId)
    : ["#60667e", "#8a91a8", "#fff", "—"];

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

          {sidebarSite && (
            <Link
              href={
                filteredSite
                  ? `/dashboard/site/settings?id=${sidebarSite.id}`
                  : "/dashboard"
              }
              className="mv2-site-switcher"
              title={filteredSite ? "사이트 설정으로" : "홈페이지 선택"}
            >
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
                <div className="ss-name">
                  {filteredSite ? sidebarSite.name : `전체 사이트 (${userSites.length})`}
                </div>
                <div className="ss-url">
                  {filteredSite ? `home.homenshop.com/${sidebarSite.shopId}` : "모든 도메인 보기"}
                </div>
              </div>
              <div className="ss-chev">
                <Icon id="i-chev-down" size={14} />
              </div>
            </Link>
          )}

          <div className="dv2-side-section">
            <div className="dv2-side-label">사이트 관리</div>
            <nav className="dv2-nav">
              <Link href="/dashboard">
                <span className="ic"><Icon id="i-home" /></span>
                <span className="label">대시보드</span>
              </Link>
              {sidebarSite && (
                <>
                  <Link href={`/dashboard/site/${sidebarSite.id}/manage`}>
                    <span className="ic"><Icon id="i-database" /></span>
                    <span className="label">데이터 관리</span>
                  </Link>
                  <Link href={`/dashboard/site/settings?id=${sidebarSite.id}`}>
                    <span className="ic"><Icon id="i-info" /></span>
                    <span className="label">기본정보 관리</span>
                  </Link>
                </>
              )}
              <Link
                className="active"
                href={filteredSite ? `/dashboard/domains?siteId=${filteredSite.id}` : "/dashboard/domains"}
              >
                <span className="ic"><Icon id="i-globe" /></span>
                <span className="label">도메인 관리</span>
                {totalCount > 0 && <span className="badge">{totalCount}</span>}
              </Link>
            </nav>
          </div>

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
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              <Link href="/dashboard">대시보드</Link>
              <span className="sep">/</span>
              {filteredSite && (
                <>
                  <Link href={`/dashboard/site/settings?id=${filteredSite.id}`}>
                    {filteredSite.name}
                  </Link>
                  <span className="sep">/</span>
                </>
              )}
              <span className="cur">도메인 관리</span>
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

          <div className="dv2-content">
            {/* Page head */}
            <div className="dm2-page-head">
              <div className="dm2-title-wrap">
                <h1 className="dm2-title">
                  <svg width={22} height={22} style={{ color: "var(--brand)" }}>
                    <use href="#i-globe" />
                  </svg>
                  {t("title")}
                  <span className="cnt">{totalCount}{t("domainCount")}</span>
                </h1>
                <div className="dm2-sub">
                  보유한 커스텀 도메인을 사이트에 연결하고, DNS · SSL 상태를 관리합니다.
                </div>
                {filteredSite && (
                  <div className="dm2-filter-chip">
                    <Icon id="i-link" size={11} />
                    <span>
                      사이트 필터: <b>{filteredSite.name}</b>
                    </span>
                    <Link href="/dashboard/domains" className="close" title="전체 보기">×</Link>
                  </div>
                )}
              </div>
              <a href="#add-domain" className="dm2-add-btn">
                <Icon id="i-plus" size={13} /> 도메인 추가
              </a>
            </div>

            {/* Stat pills */}
            <div className="dm2-stats">
              <div className="dm2-stat a">
                <div className="ic"><Icon id="i-globe" size={18} /></div>
                <div>
                  <div className="v">{totalCount}</div>
                  <div className="k">등록된 도메인</div>
                </div>
              </div>
              <div className="dm2-stat b">
                <div className="ic"><Icon id="i-check" size={18} /></div>
                <div>
                  <div className="v">{activeCount}</div>
                  <div className="k">활성 연결</div>
                </div>
              </div>
              <div className="dm2-stat c">
                <div className="ic"><Icon id="i-shield" size={18} /></div>
                <div>
                  <div className="v">
                    {sslCount}
                    {totalCount > 0 && <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>/{totalCount}</span>}
                  </div>
                  <div className="k">SSL 발급됨</div>
                </div>
              </div>
              <div className="dm2-stat d">
                <div className="ic"><Icon id="i-clock" size={18} /></div>
                <div>
                  <div className="v">
                    {longestDays > 0 ? (
                      <>
                        {longestDays}
                        <span className="unit">일</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="k">최장 갱신까지</div>
                </div>
              </div>
            </div>

            {/* Domain list */}
            <section className="dm2-card blue">
              <div className="dm2-card-head">
                <div className="accent" />
                <h3>
                  <svg className="ic" width={16} height={16}><use href="#i-globe" /></svg>
                  내 도메인
                </h3>
                <div className="dm2-head-btns">
                  <span className="dm2-search" title="도메인 검색 (곧 제공)">
                    <Icon id="i-search" size={13} />
                    <input placeholder="도메인 검색…" disabled />
                  </span>
                </div>
              </div>

              {domains.length > 0 ? (
                <table className="dm2-tbl">
                  <thead>
                    <tr>
                      <th>도메인</th>
                      <th>상태</th>
                      <th>SSL</th>
                      <th>연결된 사이트</th>
                      <th>등록일</th>
                      <th>만료까지</th>
                      <th className="right">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d, idx) => {
                      const [from, to, color, label] = pickThumb(d.site.shopId);
                      const days = daysBetween(estimatedExpiry(d.createdAt), now);
                      const daysClass = days > 300 ? "ok" : days > 90 ? "warn" : "danger";
                      const isPrimary = idx === 0;

                      return (
                        <tr key={d.id}>
                          <td>
                            <div className="dm2-cell-domain">
                              <div className="dm2-fav">
                                <Icon id="i-globe" size={14} />
                              </div>
                              <div>
                                <a
                                  href={`https://${d.domain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="dm2-domain-name"
                                >
                                  {d.domain}
                                  {isPrimary && filteredSite && (
                                    <span className="dm2-primary-tag">★ 기본</span>
                                  )}
                                </a>
                                <div className="dm2-subdomain">
                                  www.{d.domain}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <DomainStatusBadge status={d.status} labels={{
                              PENDING: t("statusPending"),
                              ACTIVE: t("statusActive"),
                              EXPIRED: t("statusExpired"),
                            }} />
                          </td>
                          <td>
                            {d.sslEnabled ? (
                              <span className="dm2-badge ok">
                                <svg width={10} height={10} style={{ marginRight: -2 }}>
                                  <use href="#i-lock" />
                                </svg>
                                활성
                              </span>
                            ) : d.status === "ACTIVE" ? (
                              <ProvisionSslButton domainId={d.id} />
                            ) : (
                              <span className="dm2-badge none">{t("sslInactive")}</span>
                            )}
                          </td>
                          <td>
                            <Link
                              href={`/dashboard/site/settings?id=${d.site.id}`}
                              className="dm2-site-link"
                              title="사이트 설정으로 이동"
                            >
                              <span
                                className="dm2-site-thumb"
                                style={{ background: `linear-gradient(135deg, ${from}, ${to})`, color }}
                              >
                                {label}
                              </span>
                              {d.site.name}
                            </Link>
                          </td>
                          <td>
                            <span className="dm2-date">
                              {d.createdAt.toLocaleDateString("ko-KR")}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`dm2-days ${daysClass}`}
                              title="도메인 등록일 + 365일 기준 추정치 (정확한 만료일은 도메인 구매 업체 확인)"
                            >
                              ~{days}일
                            </span>
                          </td>
                          <td>
                            <div className="dm2-actions">
                              <Link
                                href={`/dashboard/domains?siteId=${d.site.id}`}
                                className="dm2-act"
                              >
                                설정
                              </Link>
                              <DeleteDomainForm domainId={d.id} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="dm2-tbl">
                  <tbody>
                    <tr className="dm2-empty-row">
                      <td colSpan={7}>
                        <div className="dm2-empty-ic">
                          <Icon id="i-globe" size={28} />
                        </div>
                        <div className="dm2-empty-t">연결된 도메인이 없습니다</div>
                        <div className="dm2-empty-s">아래에서 첫 도메인을 추가해보세요.</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </section>

            {/* Add Domain form */}
            <div id="add-domain">
              <AddDomainForm
                siteId={filteredSite?.id ?? null}
                siteName={filteredSite?.name ?? null}
                availableSites={effectiveSiteId ? [] : userSites}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DomainStatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const cls =
    status === "ACTIVE" ? "dm2-badge ok"
    : status === "EXPIRED" ? "dm2-badge error"
    : "dm2-badge pending";
  return <span className={cls}>{labels[status] || status}</span>;
}
