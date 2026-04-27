import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import { Icon } from "../dashboard-icons";
import SiteChannelsClient, { type SiteIntegration } from "./site-channels-client";
import { listAdapters } from "@/lib/marketplaces/registry";
import {
  daysUntilExpiry,
  isSiteExpired,
  shouldShowExpirationWarning,
} from "@/lib/site-expiration";
import type { OrderChannel } from "@/generated/prisma/client";

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

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    include: {
      domains: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      pages: {
        select: { id: true, isHome: true, lang: true, updatedAt: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const integrations = await prisma.marketplaceIntegration.findMany({
    where: { siteId: { in: sites.map((s) => s.id) } },
    select: {
      id: true,
      siteId: true,
      channel: true,
      label: true,
      displayName: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });

  type ConnectableChannel = Exclude<OrderChannel, "STOREFRONT">;
  const adapters = listAdapters().map((a) => ({
    channel: a.channel as ConnectableChannel,
    displayName: a.displayName,
    implemented: a.implemented,
  }));

  // Group integrations by site for fast lookup.
  const integrationsBySite = new Map<string, SiteIntegration[]>();
  for (const i of integrations) {
    if (i.channel === "STOREFRONT") continue;
    const list = integrationsBySite.get(i.siteId) ?? [];
    list.push({
      id: i.id,
      channel: i.channel as ConnectableChannel,
      label: i.label,
      displayName: i.displayName,
      status: i.status,
      lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      lastError: i.lastError,
    });
    integrationsBySite.set(i.siteId, list);
  }

  const totalIntegrations = integrations.length;
  const activeIntegrations = integrations.filter((i) => i.status === "ACTIVE").length;

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
            보유한 <b>{sites.length}개</b>의 사이트와 연결된{" "}
            <b>{totalIntegrations}개</b>의 마켓플레이스 계정 ({activeIntegrations}개 활성)을
            한 화면에서 관리합니다.
          </div>
        </div>
      </div>

      {sites.length === 0 ? (
        <section className="dv2-panel">
          <div className="dv2-empty">
            <div className="t">아직 홈페이지/쇼핑몰이 없습니다</div>
            <div className="d">AI로 5분 만에 만들거나, 120+ 템플릿 중 선택하세요.</div>
            <Link href="/dashboard/templates" className="dv2-row-btn primary">
              템플릿 둘러보기 <Icon id="i-chev-right" size={12} />
            </Link>
          </div>
        </section>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

            const siteIntegrations = integrationsBySite.get(s.id) ?? [];

            return (
              <section key={s.id} className="dv2-panel">
                {/* Site header */}
                <div
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    borderBottom: "1px solid var(--line-2)",
                  }}
                >
                  <div
                    className="dv2-site-thumb"
                    style={{
                      background: `linear-gradient(135deg, ${gradA}, ${gradB})`,
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                      position: "relative",
                    }}
                  >
                    {isExpired ? <span className="paused" /> : <span className="live" />}
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{s.name || s.shopId}</span>
                      <span className={`dv2-plan-tag ${plan.cls}`}>{plan.label}</span>
                      {s.accountType === "0" && remainingDays !== null && (
                        <span
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
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ink-3)",
                        marginTop: 4,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>@{s.shopId}</span>
                      <span>·</span>
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
                        {publicLabel}
                      </a>
                      <span>·</span>
                      <span>{s.pages.length} 페이지</span>
                      <span>·</span>
                      <span>최근 수정 {koreanTimeAgo(lastModified)}</span>
                      {!activeDomain && (
                        <>
                          <span>·</span>
                          <span style={{ color: "#b45309" }}>⚠ 커스텀 도메인 미연결</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Native (STOREFRONT) channel row */}
                <div
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 10,
                      background: "#eaefff",
                      color: "#2545e0",
                      minWidth: 60,
                      textAlign: "center",
                    }}
                  >
                    내 사이트
                  </span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>홈페이지 / 쇼핑몰</div>
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
                  <Link href="/dashboard/domains" className="dv2-row-btn">
                    <Icon id="i-globe" size={13} /> 도메인
                  </Link>
                </div>

                {/* Marketplace integrations + add new */}
                <SiteChannelsClient
                  siteId={s.id}
                  integrations={siteIntegrations}
                  adapters={adapters}
                />
              </section>
            );
          })}

          <Link
            href="/dashboard/templates"
            className="dv2-site-row add"
            style={{
              padding: "20px",
              border: "2px dashed var(--line)",
              borderRadius: 14,
              textAlign: "center",
              color: "var(--ink-2)",
              textDecoration: "none",
              display: "block",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              <Icon id="i-plus" size={14} /> 새 홈페이지/쇼핑몰 추가하기
            </span>
          </Link>
        </div>
      )}
    </DashboardShell>
  );
}
