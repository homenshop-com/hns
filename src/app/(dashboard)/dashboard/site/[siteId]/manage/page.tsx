import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import ProductSettings from "./product-settings";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../sign-out-button";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import "../../../dashboard-v2.css";
import "./manage-v2.css";
import { DashboardIconSprite, Icon } from "../../../dashboard-icons";
import DashboardShell from "../../../dashboard-shell";
import { getTempDomain } from "@/lib/temp-domains";

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

const SITE_THUMB_GRADS: Record<string, [string, string, string, string]> = {
  // shopId → [bg-from, bg-to, text-color, label]
  unionled:      ["#0a1630", "#1a3370", "#6fa0ff", "LED"],
  xunion5:       ["#1f2940", "#3a4b7a", "#ffffff", "X5"],
  bomnaldriving: ["#ffe8d4", "#ff9a5a", "#7c3a00", "🌸"],
};

function pickThumb(shopId: string): [string, string, string, string] {
  if (SITE_THUMB_GRADS[shopId]) return SITE_THUMB_GRADS[shopId];
  // Fallback — hash shopId to a slate palette
  let h = 0;
  for (let i = 0; i < shopId.length; i++) h = ((h << 5) - h + shopId.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return [
    `hsl(${hue}, 40%, 22%)`,
    `hsl(${hue}, 45%, 40%)`,
    "#fff",
    shopId.slice(0, 2).toUpperCase(),
  ];
}

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

async function getBoardCategories(siteId: string) {
  const categories = await prisma.boardCategory.findMany({
    where: { siteId },
    orderBy: { legacyId: "asc" },
    include: { _count: { select: { posts: { where: { parentId: null } } } } },
  });
  return categories.map((c) => ({
    id: c.legacyId ?? 0,
    lang: c.lang,
    name: c.name,
    cnt: c._count.posts,
  }));
}

/* ────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────── */

export default async function SiteManagePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const [td, tm] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("manage"),
  ]);

  const { siteId } = await params;

  const [site, currentUser] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      include: {
        pages: { select: { id: true, isHome: true, lang: true }, orderBy: { sortOrder: "asc" } },
        products: { select: { id: true } },
        domains: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, credits: true },
    }),
  ]);

  if (!site || site.userId !== session.user.id) redirect("/dashboard");

  const productCount = site.products.length;
  const ps = site.productSettings as Record<string, number> | null;
  const productSettings = {
    itemsPerRow: ps?.itemsPerRow ?? 4,
    totalRows: ps?.totalRows ?? 10,
    thumbWidth: ps?.thumbWidth ?? 135,
    thumbHeight: ps?.thumbHeight ?? 135,
    detailWidth: ps?.detailWidth ?? 500,
  };
  const boardCategories = await getBoardCategories(site.id);
  const boardPostCount = boardCategories.reduce((sum, b) => sum + b.cnt, 0);
  const homePage =
    site.pages.find((p) => p.isHome && p.lang === site.defaultLanguage) ||
    site.pages.find((p) => p.isHome) ||
    site.pages[0];

  const activeDomain = site.domains[0];
  const sTemp = getTempDomain(site);
  const publicUrl = activeDomain ? `https://${activeDomain.domain}` : `https://${sTemp}/${site.shopId}/`;
  const publicUrlLabel = activeDomain ? activeDomain.domain : `${sTemp}/${site.shopId}`;
  const defaultUrl = `${sTemp}/${site.shopId}`;

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "게스트";
  const credits = currentUser?.credits ?? 0;
  const [thumbFrom, thumbTo, thumbColor, thumbLabel] = pickThumb(site.shopId);

  const siteName = site.name || site.shopId;
  const unreadInquiries = boardCategories.find((b) => b.id === 13)?.cnt ?? 0;

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: td("breadcrumbHome"), href: "/dashboard" },
        { label: siteName, href: `/dashboard/site/settings?id=${site.id}` },
        { label: td("btnData") },
      ]}
    >
            {/* URL banner */}
            <div className="mv2-url-banner">
              <div className="mv2-url-left">
                <div className="lbl">
                  <Icon id="i-globe" size={12} /> {tm("siteUrl")}
                </div>
                <div className="u">
                  <a className="main-url" href={`https://${defaultUrl}`} target="_blank" rel="noopener noreferrer">
                    {defaultUrl}
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
                  {site.published && <span className="publish-chip">게시중</span>}
                </div>
              </div>
              <div className="mv2-url-actions">
                <a className="mv2-btn-secondary" href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <Icon id="i-eye" size={14} /> {tm("viewSite")}
                </a>
                {homePage ? (
                  <Link href={`/dashboard/site/pages/${homePage.id}/edit`} className="mv2-btn-primary">
                    <Icon id="i-edit" size={14} /> {tm("openEditor")}
                  </Link>
                ) : (
                  <button className="mv2-btn-primary" disabled>
                    <Icon id="i-edit" size={14} /> {tm("openEditor")}
                  </button>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="mv2-kpi-row">
              <div className={`mv2-kpi${productCount === 0 ? " empty" : ""}`}>
                <div className="kpi-top">
                  {tm("statProducts")}
                  <div className="ic" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                    <Icon id="i-package" size={13} />
                  </div>
                </div>
                <div className="v">
                  {productCount}
                  {productCount > 0 && <span className="unit">개</span>}
                </div>
                {productCount === 0 ? (
                  <>
                    <div className="sub">아직 등록된 상품이 없어요</div>
                    <Link href="/dashboard/products" className="kpi-action">
                      상품 등록하기 →
                    </Link>
                  </>
                ) : (
                  <div className="sub">
                    <Link
                      href="/dashboard/products"
                      style={{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}
                    >
                      상품 관리 →
                    </Link>
                  </div>
                )}
              </div>
              <div className={`mv2-kpi${boardPostCount === 0 ? " empty" : ""}`}>
                <div className="kpi-top">
                  {tm("statBoards")}
                  <div className="ic" style={{ background: "var(--green-soft)", color: "#0d7d45" }}>
                    <Icon id="i-board" size={13} />
                  </div>
                </div>
                <div className="v">
                  {boardPostCount}
                  {boardPostCount > 0 && <span className="unit">건</span>}
                </div>
                <div className="sub">
                  {boardCategories.filter((b) => b.cnt > 0).length}개 카테고리 사용 중
                </div>
              </div>
              <div className="mv2-kpi empty">
                <div className="kpi-top">
                  {tm("statMembers")}
                  <div className="ic" style={{ background: "var(--slate-soft, #eceef6)", color: "#2d3148" }}>
                    <Icon id="i-users" size={13} />
                  </div>
                </div>
                <div className="v">0</div>
                <div className="sub">회원제 미사용</div>
                <span className="kpi-action" style={{ color: "var(--ink-4)", cursor: "default" }}>
                  SOON
                </span>
              </div>
              <div className="mv2-kpi">
                <div className="kpi-top">
                  {tm("statStorage")}
                  <div className="ic" style={{ background: "#f2f4fa", color: "var(--ink-2)" }}>
                    <Icon id="i-save" size={13} />
                  </div>
                </div>
                <div className="v" style={{ color: "var(--ink-3)", fontWeight: 700 }}>—</div>
                <div className="sub">{tm("storageCalc")}</div>
              </div>
            </div>

            {/* Data 4-column grid */}
            <div className="mv2-data-grid">
              {/* Menu management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-orange">
                  <div className="ic"><Icon id="i-menu" size={15} /></div>
                  <h3>{tm("menuManage")}</h3>
                  <div className="meta">{site.pages.length}개 페이지</div>
                </div>
                <div className="mv2-list">
                  <Link href={`/dashboard/site/${siteId}/manage/menus`} className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("menuManageLink")}</span></div>
                    <div className="li-right">
                      <span>구성 바로가기</span>
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                </div>
                <div className="mv2-empty-col">
                  <div className="ic"><Icon id="i-menu" size={18} /></div>
                  <div className="t">메뉴 구조 시각화</div>
                  <div className="s">드래그로 순서를 바꾸고<br />하위 메뉴를 구성하세요</div>
                  <Link href={`/dashboard/site/${siteId}/manage/menus`} className="tool-btn-primary">
                    <Icon id="i-plus" size={12} /> 메뉴 편집
                  </Link>
                </div>
              </div>

              {/* Board management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-green">
                  <div className="ic"><Icon id="i-board" size={15} /></div>
                  <h3>{tm("boardManage")}</h3>
                  <div className="meta">
                    {boardCategories.length}개 · 총 {boardPostCount}건
                  </div>
                </div>
                <div className="mv2-list">
                  <Link href="/dashboard/boards/posts" className="mv2-list-item">
                    <div className="li-title">
                      <span className="n">{tm("postManage")}</span>
                      <span className="lang-chip">전체</span>
                    </div>
                    <div className="li-right">
                      <span className="count">{boardPostCount}</span>
                      <span>건</span>
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                  {boardCategories
                    .filter((b) => b.name && b.name !== "Default")
                    .map((b) => {
                      const isInquiry = b.id === 13; // 견적문의 및 주문
                      const isEmpty = b.cnt === 0;
                      const cls = [
                        "mv2-list-item",
                        isInquiry && b.cnt > 0 ? "highlight" : "",
                        isEmpty ? "empty" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <Link
                          key={`${b.id}-${b.lang}`}
                          href={`/dashboard/boards/posts?category=${b.id}`}
                          className={cls}
                        >
                          <div className="li-title">
                            <span className="n">{b.name}</span>
                            {b.lang && <span className="lang-chip">{b.lang}</span>}
                          </div>
                          <div className="li-right">
                            <span className="count">{b.cnt}</span>
                            <span>건</span>
                            <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                          </div>
                        </Link>
                      );
                    })}
                </div>
              </div>

              {/* Product management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-blue">
                  <div className="ic"><Icon id="i-package" size={15} /></div>
                  <h3>{tm("productManage")}</h3>
                  <div className="meta">{productCount}개</div>
                </div>
                <div className="mv2-list">
                  <Link href="/dashboard/products" className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("productList")}</span></div>
                    <div className="li-right">
                      <span className="count">{productCount}</span>
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                  <Link href="/dashboard/products/categories" className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("categoryManage")}</span></div>
                    <div className="li-right">
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                  <Link href="/dashboard/orders" className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("orderList")}</span></div>
                    <div className="li-right">
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                </div>
                <ProductSettings
                  siteId={siteId}
                  initialSettings={productSettings}
                  variant="v2"
                  labels={{
                    productDisplaySettings: tm("productDisplaySettings"),
                    itemsPerRow: tm("itemsPerRow"),
                    totalRows: tm("totalRows"),
                    perPage: tm("perPage"),
                    thumbWidth: tm("thumbWidth"),
                    thumbHeight: tm("thumbHeight"),
                    detailImageWidth: tm("detailImageWidth"),
                    saveSettings: tm("saveSettings"),
                    saving: tm("saving"),
                    saved: tm("saved"),
                    saveError: tm("saveError"),
                    error: tm("error"),
                  }}
                />
              </div>

              {/* Member management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-slate">
                  <div className="ic"><Icon id="i-users" size={15} /></div>
                  <h3>{tm("memberManage")}</h3>
                  <div className="meta">0명</div>
                </div>
                <div className="mv2-list">
                  <div className="mv2-list-item" style={{ cursor: "default" }}>
                    <div className="li-title"><span className="n">{tm("memberList")}</span></div>
                    <div className="li-right">
                      <span className="count">0</span>
                      <span>명</span>
                    </div>
                  </div>
                </div>
                <div className="mv2-empty-col">
                  <div className="ic"><Icon id="i-users" size={18} /></div>
                  <div className="t">회원 기능 꺼짐</div>
                  <div className="s">
                    회원가입 · 마이페이지 · 회원전용<br />
                    게시판을 사용하려면 활성화하세요
                  </div>
                  <button type="button" className="tool-btn-primary" disabled title="준비 중인 기능">
                    <Icon id="i-plus" size={12} /> 회원 기능 활성화
                  </button>
                </div>
                <div className="mv2-activity-summary">
                  <h4>최근 활동 요약</h4>
                  <div className="lines">
                    • 신규 가입 · <b>0</b><br />
                    • 최근 로그인 · <b>—</b><br />
                    • 탈퇴 요청 · <b>0</b>
                  </div>
                </div>
              </div>
            </div>
    </DashboardShell>
  );
}
