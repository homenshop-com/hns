import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import ProductSettings from "./product-settings";
import SearchSettings from "./search-settings";
import BoardsPanel from "./boards-panel";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../sign-out-button";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import "../../../dashboard-v2.css";
import "./manage-v2.css";
import { DashboardIconSprite, Icon } from "../../../dashboard-icons";
import DashboardShell from "../../../dashboard-shell";
import { resolvePublicHost } from "@/lib/temp-domains";
import { getResellerForHost } from "@/lib/reseller";
import { getAnalyticsSummary } from "@/lib/analytics";
import AnalyticsPanel from "@/app/admin/analytics-panel";
import { canManageSite } from "@/lib/site-access";

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

/* ────────────────────────────────────────────────────────────────
 * Storage helpers
 * ──────────────────────────────────────────────────────────────── */

/** Recursively sum file sizes under `dir`. Returns 0 if path doesn't exist. */
function calcDirSize(dir: string, depth = 0): number {
  if (depth > 8) return 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    let total = 0;
    for (const e of entries) {
      const full = join(dir, e.name);
      try {
        if (e.isFile()) {
          total += statSync(full).size;
        } else if (e.isDirectory()) {
          total += calcDirSize(full, depth + 1);
        }
      } catch { /* skip unreadable entry */ }
    }
    return total;
  } catch {
    return 0; // directory doesn't exist or unreadable → 0
  }
}

/** Format bytes as human-readable string. */
function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function getBoardCategories(siteId: string) {
  const categories = await prisma.boardCategory.findMany({
    where: { siteId },
    orderBy: { legacyId: "asc" },
    include: { _count: { select: { posts: { where: { parentId: null } } } } },
  });
  return categories.map((c) => ({
    pgId: c.id,          // Prisma UUID — for API calls (create/delete)
    id: c.legacyId ?? 0, // Legacy numeric ID — for post list links
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

  const [td, tm, t] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("manage"),
    getTranslations("siteManage"),
  ]);

  const { siteId } = await params;

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

  const [
    site, currentUser, siteOrderStats, recentOrders,
    newOrders24h, newOrders7d,
    inquiryUnread, inquiry24h, inquiryTotal,
  ] = await Promise.all([
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
    // 사이트 주문 통계 (PRODUCT only)
    prisma.order.groupBy({
      by: ["status"],
      where: { siteId, orderType: "PRODUCT" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.order.findMany({
      where: { siteId, orderType: "PRODUCT" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        items: {
          select: { product: { select: { name: true } }, externalName: true },
          take: 1,
        },
      },
    }),
    // 신규 주문 KPI
    prisma.order.count({
      where: { siteId, orderType: "PRODUCT", createdAt: { gte: cutoff24h } },
    }),
    prisma.order.count({
      where: { siteId, orderType: "PRODUCT", createdAt: { gte: cutoff7d } },
    }),
    // 문의 및 예약 KPI
    prisma.inquiry.count({ where: { siteId, status: "NEW" } }),
    prisma.inquiry.count({ where: { siteId, createdAt: { gte: cutoff24h } } }),
    prisma.inquiry.count({ where: { siteId } }),
  ]);

  if (!site || !(await canManageSite(siteId))) redirect("/dashboard");

  // ── Storage calculation ─────────────────────────────────────────
  // Legacy uploads: /var/www/legacy-data/userdata/{shopId}/uploaded/
  // New uploads:    /var/www/uploads/site-uploads/{siteId}/
  // Both are local filesystem paths — sync reads are fine in a server component.
  const LEGACY_ROOT  = process.env.LEGACY_DATA_ROOT ?? "/var/www/legacy-data/userdata";
  const UPLOAD_ROOT  = process.env.UPLOAD_DIR ?? "/var/www/uploads";
  const storageBytes =
    calcDirSize(join(LEGACY_ROOT, site.shopId, "uploaded")) +
    calcDirSize(join(UPLOAD_ROOT, "site-uploads", site.id));
  const storageLabel = storageBytes > 0 ? fmtBytes(storageBytes) : null;

  // GA panel data — only fire the Data API call when this site has a
  // Property ID configured. Without it we just render the "not connected"
  // card with a CTA pointing at the analytics config page. The call is
  // post-Promise.all because the site row gates whether it should happen
  // at all (cheaper than always firing and discarding).
  const analyticsSummary = site.googleAnalyticsPropertyId
    ? await getAnalyticsSummary(site.googleAnalyticsPropertyId)
    : { configured: false as const, reason: t("analyticsNoIds") };

  const productCount = site.products.length;
  const ps = site.productSettings as (Record<string, number> & { buttonMode?: "sales" | "inquiry" | "none"; searchEnabled?: boolean; boardSearchEnabled?: boolean }) | null;
  const productSettings = {
    itemsPerRow: ps?.itemsPerRow ?? 4,
    totalRows: ps?.totalRows ?? 10,
    thumbWidth: ps?.thumbWidth ?? 135,
    thumbHeight: ps?.thumbHeight ?? 135,
    detailWidth: ps?.detailWidth ?? 500,
    buttonMode: ps?.buttonMode ?? ("sales" as const),
  };
  // Search settings are stored in the same productSettings JSON but managed
  // by a dedicated panel (see SearchSettings component) below the data grid.
  const searchSettings = {
    searchEnabled: ps?.searchEnabled ?? false,
    boardSearchEnabled: ps?.boardSearchEnabled ?? true,
  };
  const boardCategories = await getBoardCategories(site.id);
  const boardPostCount = boardCategories.reduce((sum, b) => sum + b.cnt, 0);
  const homePage =
    site.pages.find((p) => p.isHome && p.lang === site.defaultLanguage) ||
    site.pages.find((p) => p.isHome) ||
    site.pages[0];

  const activeDomain = site.domains[0];
  // Reseller context: on a white-label host, public URLs must surface
  // `home.{reseller domain}` instead of leaking `home.homenshop.com`.
  const reseller = await getResellerForHost();
  const sTemp = resolvePublicHost(site, reseller);
  const publicUrl = activeDomain ? `https://${activeDomain.domain}` : `https://${sTemp}/${site.shopId}/`;
  const publicUrlLabel = activeDomain ? activeDomain.domain : `${sTemp}/${site.shopId}`;
  const defaultUrl = `${sTemp}/${site.shopId}`;

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || t("guest");
  const credits = currentUser?.credits ?? 0;
  const [thumbFrom, thumbTo, thumbColor, thumbLabel] = pickThumb(site.shopId);

  const siteName = site.name || site.shopId;
  const unreadInquiries = boardCategories.find((b) => b.id === 13)?.cnt ?? 0;

  // 주문 통계 집계
  const totalOrders = siteOrderStats.reduce((s, g) => s + g._count._all, 0);
  const pendingOrders = (siteOrderStats.find((g) => g.status === "PENDING")?._count._all) ?? 0;
  const shippingOrders =
    ((siteOrderStats.find((g) => g.status === "PAID")?._count._all) ?? 0) +
    ((siteOrderStats.find((g) => g.status === "SHIPPING")?._count._all) ?? 0);
  const deliveredOrders = (siteOrderStats.find((g) => g.status === "DELIVERED")?._count._all) ?? 0;
  const revenue = siteOrderStats
    .filter((g) => g.status !== "CANCELLED" && g.status !== "REFUNDED")
    .reduce((s, g) => s + (g._sum.totalAmount ?? 0), 0);

  const ORDER_STATUS_LABELS: Record<string, string> = {
    PENDING: t("orderStatusPending"),
    PAID: t("orderStatusPaid"),
    SHIPPING: t("orderStatusShipping"),
    DELIVERED: t("orderStatusDelivered"),
    CANCELLED: t("orderStatusCancelled"),
    REFUNDED: t("orderStatusRefunded"),
  };
  const ORDER_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
    PENDING: { bg: "#fef3c7", fg: "#92400e" },
    PAID: { bg: "#dbeafe", fg: "#1e40af" },
    SHIPPING: { bg: "#ede9fe", fg: "#5b21b6" },
    DELIVERED: { bg: "#dcfce7", fg: "#166534" },
    CANCELLED: { bg: "#fee2e2", fg: "#991b1b" },
    REFUNDED: { bg: "#f1f5f9", fg: "#475569" },
  };
  const CHANNEL_LABELS: Record<string, string> = {
    STOREFRONT: t("channelStorefront"),
    SHOPIFY: "Shopify",
    COUPANG: "쿠팡",
    AMAZON: "Amazon",
    QOO10: "Qoo10",
    RAKUTEN: "Rakuten",
    TIKTOKSHOP: "TikTok",
  };
  function relTime(d: Date): string {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t("relJustNow");
    if (m < 60) return t("relMinutesAgo", { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("relHoursAgo", { count: h });
    const day = Math.floor(h / 24);
    if (day < 7) return t("relDaysAgo", { count: day });
    const dt = new Date(d);
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
  }

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
                  {site.published && <span className="publish-chip">{t("published")}</span>}
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
                  {productCount > 0 && <span className="unit">{t("unitItems")}</span>}
                </div>
                {productCount === 0 ? (
                  <>
                    <div className="sub">{t("noProductsYet")}</div>
                    <Link href={`/dashboard/products?siteId=${site.id}`} className="kpi-action">
                      {t("registerProduct")}
                    </Link>
                  </>
                ) : (
                  <div className="sub">
                    <Link
                      href={`/dashboard/products?siteId=${site.id}`}
                      style={{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}
                    >
                      {t("manageProducts")}
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
                  {boardPostCount > 0 && <span className="unit">{t("unitPosts")}</span>}
                </div>
                <div className="sub">
                  {t("categoriesInUse", { count: boardCategories.filter((b) => b.cnt > 0).length })}
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
                <div className="sub">{t("membershipUnused")}</div>
                <span className="kpi-action" style={{ color: "var(--ink-4)", cursor: "default" }}>
                  {t("soon")}
                </span>
              </div>
              {/* 신규 주문 KPI */}
              <Link
                href={`/dashboard/orders?siteId=${site.id}`}
                className={`mv2-kpi${newOrders24h === 0 ? " empty" : ""}`}
                style={{ textDecoration: "none", color: "inherit", position: "relative" }}
              >
                <div className="kpi-top">
                  {t("newOrders")}
                  <div className="ic" style={{ background: "#e8f3ff", color: "#3182f6" }}>
                    <i className="fa-solid fa-bag-shopping" style={{ fontSize: 13 }} />
                  </div>
                </div>
                <div className="v">
                  {newOrders24h}
                  {newOrders24h > 0 && <span className="unit">{t("unitPosts")}</span>}
                </div>
                {pendingOrders > 0 ? (
                  <div className="sub" style={{ color: "#92400e", fontWeight: 600 }}>
                    <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 10, marginRight: 4 }} />
                    {t("pendingOrdersCount", { count: pendingOrders })}
                  </div>
                ) : newOrders24h > 0 ? (
                  <div className="sub">
                    {t.rich("todayNewLast7d", { count: newOrders7d, b: (c) => <b>{c}</b> })}
                  </div>
                ) : newOrders7d > 0 ? (
                  <div className="sub">
                    {t.rich("noNewTodayLast7d", { count: newOrders7d, b: (c) => <b>{c}</b> })}
                  </div>
                ) : (
                  <>
                    <div className="sub">{t("noNewOrders7d")}</div>
                    <span className="kpi-action">{t("ordersPageLink")}</span>
                  </>
                )}
              </Link>

              {/* 문의 및 예약 KPI */}
              <Link
                href={`/dashboard/inquiries?siteId=${site.id}${inquiryUnread > 0 ? "&status=NEW" : ""}`}
                className={`mv2-kpi${inquiryUnread > 0 ? "" : " empty"}`}
                style={{ textDecoration: "none", color: "inherit", position: "relative" }}
              >
                <div className="kpi-top">
                  {t("inquiriesReservations")}
                  <div className="ic" style={{ background: "#fdf4ff", color: "#9333ea" }}>
                    <i className="fa-regular fa-envelope" style={{ fontSize: 13 }} />
                  </div>
                </div>
                <div className="v">
                  {inquiryUnread}
                  {inquiryUnread > 0 && <span className="unit">{t("unitPosts")}</span>}
                </div>
                {inquiryUnread > 0 ? (
                  <div className="sub" style={{ color: "#7e22ce", fontWeight: 600 }}>
                    <i className="fa-solid fa-circle-dot" style={{ fontSize: 10, marginRight: 4 }} />
                    {t("unreadCount", { count: inquiryUnread })}
                  </div>
                ) : inquiry24h > 0 ? (
                  <div className="sub">{t.rich("todayNewCount", { count: inquiry24h, b: (c) => <b>{c}</b> })}</div>
                ) : inquiryTotal > 0 ? (
                  <div className="sub">{t("totalNoUnread", { count: inquiryTotal })}</div>
                ) : (
                  <>
                    <div className="sub">{t("noInquiriesYet")}</div>
                    <span className="kpi-action">{t("inquiriesPageLink")}</span>
                  </>
                )}
              </Link>

              {/* 저장 용량 KPI */}
              <div className={`mv2-kpi${storageLabel ? "" : " empty"}`}>
                <div className="kpi-top">
                  {tm("statStorage")}
                  <div className="ic" style={{ background: "#f2f4fa", color: "var(--ink-2)" }}>
                    <Icon id="i-save" size={13} />
                  </div>
                </div>
                {storageLabel ? (
                  <>
                    <div className="v" style={{ fontSize: storageLabel.length > 7 ? 20 : undefined }}>
                      {storageLabel}
                    </div>
                    <div className="sub">
                      {t("storageUploadFiles")}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="v" style={{ color: "var(--ink-3)", fontWeight: 700 }}>—</div>
                    <div className="sub">{tm("storageCalc")}</div>
                  </>
                )}
              </div>
            </div>

            {/* Google Analytics — full panel reuses the admin component. Same
                visual language, different data source (this user's GA property,
                fetched via the per-site /api/dashboard route). Renders an
                inline "not connected" CTA pointing at the config page when
                the user hasn't wired up GA yet. */}
            <div style={{ marginBottom: 20 }}>
              <AnalyticsPanel
                initial={analyticsSummary}
                propertyId={site.googleAnalyticsPropertyId ?? undefined}
                refreshUrl={`/api/dashboard/sites/${site.id}/analytics`}
                notConnectedHelpHref={`/dashboard/site/${site.id}/manage/config/analytics`}
                notConnectedHelpLabel={t("configure")}
              />
            </div>

            {/* Data 4-column grid */}
            <div className="mv2-data-grid">
              {/* Menu management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-orange">
                  <div className="ic"><Icon id="i-menu" size={15} /></div>
                  <h3>{tm("menuManage")}</h3>
                  <div className="meta">{t("pagesCount", { count: site.pages.length })}</div>
                </div>
                <div className="mv2-list">
                  <Link href={`/dashboard/site/${siteId}/manage/menus`} className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("menuManageLink")}</span></div>
                    <div className="li-right">
                      <span>{t("goToConfig")}</span>
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                </div>
                <div className="mv2-empty-col">
                  <div className="ic"><Icon id="i-menu" size={18} /></div>
                  <div className="t">{t("menuStructureViz")}</div>
                  <div className="s">{t.rich("menuStructureVizDesc", { br: () => <br /> })}</div>
                  <Link href={`/dashboard/site/${siteId}/manage/menus`} className="tool-btn-primary">
                    <Icon id="i-plus" size={12} /> {t("editMenu")}
                  </Link>
                </div>
              </div>

              {/* Board management — BoardsPanel handles create/delete client-side */}
              <BoardsPanel
                siteId={site.id}
                totalPostCount={boardPostCount}
                initialBoards={boardCategories.map((b) => ({
                  pgId: b.pgId,
                  legacyId: b.id,
                  name: b.name,
                  lang: b.lang,
                  cnt: b.cnt,
                }))}
                labels={{
                  boardManage: tm("boardManage"),
                  postManage: tm("postManage"),
                }}
              />

              {/* Product management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-blue">
                  <div className="ic"><Icon id="i-package" size={15} /></div>
                  <h3>{tm("productManage")}</h3>
                  <div className="meta">{t("itemsCount", { count: productCount })}</div>
                </div>
                <div className="mv2-list">
                  <Link href={`/dashboard/products?siteId=${site.id}`} className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("productList")}</span></div>
                    <div className="li-right">
                      <span className="count">{productCount}</span>
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                  <Link href={`/dashboard/products/categories?siteId=${site.id}`} className="mv2-list-item">
                    <div className="li-title"><span className="n">{tm("categoryManage")}</span></div>
                    <div className="li-right">
                      <span className="chev"><Icon id="i-chev-right" size={12} /></span>
                    </div>
                  </Link>
                  {/* 2026-05-18 주문 리스트 링크 제거: 하단 "최근 주문"
                      패널 + 상단 신규주문 KPI에서 통합 노출하므로 중복. */}
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

              {/* 2026-05-18 사용자 요청 정리: 주문 진입점이 5군데 산만했음.
                  → 5번째 컬럼 "주문 관리" 제거.
                  · 신규 주문 알림 = 상단 KPI 카드 (한 곳)
                  · 상세 리스트 + 상태별 필터 + 누적 매출 = 하단 "최근 주문" 패널 (한 곳)
                  · 전역 진입 = 좌측 사이드바 (한 곳)
                  3 역할 분담 명확. */}

              {/* Member management */}
              <div className="dv2-panel mv2-data-col">
                <div className="mv2-hd-ribbon hd-slate">
                  <div className="ic"><Icon id="i-users" size={15} /></div>
                  <h3>{tm("memberManage")}</h3>
                  <div className="meta">{t("membersCount", { count: 0 })}</div>
                </div>
                <div className="mv2-list">
                  <div className="mv2-list-item" style={{ cursor: "default" }}>
                    <div className="li-title"><span className="n">{tm("memberList")}</span></div>
                    <div className="li-right">
                      <span className="count">0</span>
                      <span>{t("unitPeople")}</span>
                    </div>
                  </div>
                </div>
                <div className="mv2-empty-col">
                  <div className="ic"><Icon id="i-users" size={18} /></div>
                  <div className="t">{t("memberFeatureOff")}</div>
                  <div className="s">
                    {t.rich("memberFeatureOffDesc", { br: () => <br /> })}
                  </div>
                  <button type="button" className="tool-btn-primary" disabled title={t("comingSoon")}>
                    <Icon id="i-plus" size={12} /> {t("enableMemberFeature")}
                  </button>
                </div>
                <div className="mv2-activity-summary">
                  <h4>{t("recentActivitySummary")}</h4>
                  <div className="lines">
                    {t.rich("activityNewSignups", { b: (c) => <b>{c}</b> })}<br />
                    {t.rich("activityRecentLogin", { b: (c) => <b>{c}</b> })}<br />
                    {t.rich("activityWithdrawalRequests", { b: (c) => <b>{c}</b> })}
                  </div>
                </div>
              </div>
            </div>

            {/* 사이트 검색 — 상품·게시판을 가로지르는 사이트 단위 설정이라
                상품관리 컬럼에서 분리해 별도 섹션으로 노출. */}
            <SearchSettings siteId={siteId} initial={searchSettings} />

            {/* 주문 관리 통합 패널 — 사이트 스코프. 2026-05-18 사용자 요청에
                따라 5번째 컬럼 + 상품관리 내부 링크 제거하고 이 패널 하나로 통합.
                상태 필터 + 누적 매출 + 최근 6건 + 전체 보기 — 모든 주문 관련
                진입점을 한 곳에 모음. */}
            <section className="dv2-panel" style={{ marginTop: 16, overflow: "hidden" }}>
              <div className="dv2-panel-head" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ marginBottom: 4 }}>
                    <i className="fa-solid fa-bag-shopping" style={{ fontSize: 12, marginRight: 6, color: "#3182f6" }} />
                    {t("orderManagement")}
                    <span className="count">{t("ordersCount", { count: totalOrders })}</span>
                  </h2>
                  {/* 누적 매출 inline (이전 5번째 컬럼에 있었던 정보 통합) */}
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {t("cumulativeRevenue")}{" "}
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 700, color: "var(--ink-0)", fontSize: 13 }}>
                      ₩{revenue.toLocaleString()}
                    </span>
                    <span style={{ marginLeft: 4 }}>{t("excludingCancelledRefunded")}</span>
                  </div>
                </div>
                <div className="tools">
                  <Link href={`/dashboard/orders?siteId=${site.id}`} className="dv2-tool-btn">
                    <i className="fa-solid fa-arrow-right-long" style={{ fontSize: 11 }} /> {t("viewAll")}
                  </Link>
                </div>
              </div>

              {/* 상태 필터 칩 (이전 5번째 컬럼에 있던 4-row 리스트를 칩으로 압축) */}
              <div style={{
                padding: "10px 20px", borderBottom: "1px solid var(--line-2)",
                background: "var(--panel-2)",
                display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
              }}>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>{t("statusShortcuts")}</span>
                <Link
                  href={`/dashboard/orders?siteId=${site.id}&status=PENDING`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: pendingOrders > 0 ? "#fef3c7" : "#fff",
                    color: pendingOrders > 0 ? "#92400e" : "var(--ink-2)",
                    border: pendingOrders > 0 ? "1px solid #fde68a" : "1px solid var(--line)",
                    textDecoration: "none",
                  }}
                >
                  {pendingOrders > 0 && <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 10 }} />}
                  {t("orderStatusPending")} <b style={{ fontVariantNumeric: "tabular-nums" }}>{pendingOrders}</b>
                </Link>
                <Link
                  href={`/dashboard/orders?siteId=${site.id}&status=SHIPPING`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: "#fff", color: "var(--ink-2)",
                    border: "1px solid var(--line)", textDecoration: "none",
                  }}
                >
                  {t("paidShipping")} <b style={{ fontVariantNumeric: "tabular-nums" }}>{shippingOrders}</b>
                </Link>
                <Link
                  href={`/dashboard/orders?siteId=${site.id}&status=DELIVERED`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: "#fff", color: "var(--ink-2)",
                    border: "1px solid var(--line)", textDecoration: "none",
                  }}
                >
                  {t("orderStatusDelivered")} <b style={{ fontVariantNumeric: "tabular-nums" }}>{deliveredOrders}</b>
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, margin: "0 auto 12px",
                    background: "linear-gradient(135deg, #e8f3ff, #d6e8ff)",
                    display: "grid", placeItems: "center", color: "#3182f6",
                  }}>
                    <i className="fa-solid fa-bag-shopping" style={{ fontSize: 20 }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
                    {t("noOrdersYet")}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    {t("noOrdersYetDesc")}
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 13.5, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--panel-2)", borderBottom: "1px solid var(--line-2)" }}>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("colOrderNumber")}</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("colChannel")}</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("colProduct")}</th>
                        <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("colAmount")}</th>
                        <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("colStatus")}</th>
                        <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("colOrderDate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((o) => {
                        const sc = ORDER_STATUS_COLORS[o.status] ?? { bg: "#f1f5f9", fg: "#475569" };
                        const itemLabel =
                          o.items[0]?.product?.name ?? o.items[0]?.externalName ?? "—";
                        return (
                          <tr key={o.id} style={{ borderBottom: "1px solid var(--line-2)" }}>
                            <td style={{ padding: "12px 16px" }}>
                              <Link
                                href={`/dashboard/orders/${o.id}`}
                                style={{
                                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                                  fontSize: 12.5, fontWeight: 600,
                                  color: "var(--brand)", textDecoration: "none",
                                }}
                              >
                                {o.orderNumber}
                              </Link>
                            </td>
                            <td style={{ padding: "12px 12px", color: "var(--ink-1)" }}>
                              {CHANNEL_LABELS[o.channel] ?? o.channel}
                            </td>
                            <td style={{ padding: "12px 12px", color: "var(--ink-1)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {itemLabel}
                            </td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                              ₩{o.totalAmount.toLocaleString()}
                            </td>
                            <td style={{ padding: "12px 12px", textAlign: "center" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 11.5,
                                fontWeight: 600,
                                background: sc.bg,
                                color: sc.fg,
                              }}>
                                {ORDER_STATUS_LABELS[o.status] ?? o.status}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--ink-2)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                              {relTime(o.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
    </DashboardShell>
  );
}
