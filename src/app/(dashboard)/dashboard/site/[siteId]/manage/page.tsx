import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import ProductSettings from "./product-settings";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

interface BoardCategoryWithCount {
  id: number;
  lang: string;
  category: string;
  cnt: number;
}

async function getBoardCategories(siteId: string): Promise<BoardCategoryWithCount[]> {
  const categories = await prisma.boardCategory.findMany({
    where: { siteId },
    orderBy: { legacyId: "asc" },
    include: { _count: { select: { posts: { where: { parentId: null } } } } },
  });
  return categories.map((c) => ({
    id: c.legacyId ?? 0,
    lang: c.lang,
    category: c.name,
    cnt: c._count.posts,
  }));
}

export default async function SiteManagePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const td = await getTranslations("dashboard");
  const tm = await getTranslations("manage");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: { select: { id: true, isHome: true, lang: true }, orderBy: { sortOrder: "asc" } },
      products: { select: { id: true } },
      domains: true,
    },
  });

  if (!site || site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  const productCount = site.products.length;

  // Product display settings
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
  const homePage = site.pages.find(p => p.isHome && p.lang === site.defaultLanguage) || site.pages.find(p => p.isHome) || site.pages[0];
  const firstPageId = homePage?.id || null;
  const siteUrl = `home.homenshop.com/${site.shopId}`;

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">HomeNShop</Link>
            <span className="dash-logo-sub">{td("btnData")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">{td("dashboard")}</Link>
            <Link href="/dashboard/profile" className="dash-header-btn">{td("memberInfo")}</Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
        {/* Site URL & Action Buttons */}
        <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{tm("siteUrl")}</div>
            <a href={`https://${siteUrl}`} target="_blank" rel="noopener" style={{ fontSize: 16, fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>
              {siteUrl}
            </a>
            {site.domains.length > 0 && (
              <span style={{ marginLeft: 12, fontSize: 13, color: "#059669" }}>
                {site.domains[0].domain}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {firstPageId ? (
              <Link
                href={`/dashboard/site/pages/${firstPageId}/edit`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", background: "#2563eb", color: "#fff", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 500 }}
              >
                {tm("openEditor")}
              </Link>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", padding: "8px 20px", background: "#9ca3af", color: "#fff", borderRadius: 6, fontSize: 14 }}>
                {tm("openEditor")}
              </span>
            )}
            <a
              href={`https://${siteUrl}`}
              target="_blank"
              rel="noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 500 }}
            >
              {tm("viewSite")}
            </a>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{tm("statProducts")}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{productCount}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{tm("statBoards")}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{boardPostCount}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{tm("statMembers")}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>0</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{tm("statStorage")}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>-</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{tm("storageCalc")}</div>
          </div>
        </div>

        {/* Management Sections — 4열 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {/* 메뉴관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#ea580c", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              {tm("menuManage")}
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href={`/dashboard/site/${siteId}/manage/menus`} style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14 }}>
                {tm("menuManageLink")}
              </Link>
            </div>
          </div>

          {/* 게시판관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#16a34a", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              {tm("boardManage")}
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href="/dashboard/boards/posts" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14, borderBottom: "1px solid #f3f4f6" }}>
                <span>{tm("postManage")}</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{boardPostCount}{tm("postCount")}</span>
              </Link>
              {boardCategories.filter(b => b.category && b.category !== "Default").map(b => (
                <Link key={b.id} href={`/dashboard/boards/posts?category=${b.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6", fontSize: 14, color: "#374151", textDecoration: "none" }}>
                  <span>
                    {b.category}
                    {b.lang && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>{b.lang.toUpperCase()}</span>}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{b.cnt}{tm("postCount")}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* 상품관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#2563eb", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              {tm("productManage")}
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href="/dashboard/products" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14, borderBottom: "1px solid #f3f4f6" }}>
                {tm("productList")}
              </Link>
              <Link href="/dashboard/products/categories" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14, borderBottom: "1px solid #f3f4f6" }}>
                {tm("categoryManage")}
              </Link>
              <Link href="/dashboard/orders" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14, borderBottom: "1px solid #f3f4f6" }}>
                {tm("orderList")}
              </Link>
              <ProductSettings siteId={siteId} initialSettings={productSettings} labels={{
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
              }} />
            </div>
          </div>

          {/* 회원관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#374151", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              {tm("memberManage")}
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href="/admin/members" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14 }}>
                {tm("memberList")}
              </Link>
            </div>
          </div>
        </div>
      </main>
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
