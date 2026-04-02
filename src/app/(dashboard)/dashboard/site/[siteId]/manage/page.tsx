import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function SiteManagePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: { select: { id: true, isHome: true, lang: true }, orderBy: { sortOrder: "asc" } },
      products: { select: { id: true } },
      boards: {
        select: {
          id: true,
          _count: { select: { posts: true } },
        },
      },
      domains: true,
    },
  });

  if (!site || site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  const productCount = site.products.length;
  const boardPostCount = site.boards.reduce((sum, b) => sum + b._count.posts, 0);
  const homePage = site.pages.find(p => p.isHome && p.lang === site.defaultLanguage) || site.pages.find(p => p.isHome) || site.pages[0];
  const firstPageId = homePage?.id || null;
  const siteUrl = `home.homenshop.com/${site.shopId}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f8", fontFamily: "Noto Sans KR, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 15%", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/dashboard" style={{ fontSize: 20, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
              HomeNShop
            </Link>
            <span style={{ color: "#6b7280", fontSize: 13 }}>데이타관리</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#374151" }}>{session.user.name}</span>
            <Link href="/dashboard" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 4 }}>
              대시보드
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 15%", padding: "24px 24px 60px" }}>
        {/* Site URL & Action Buttons */}
        <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>사이트 주소</div>
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
                에디터 열기
              </Link>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", padding: "8px 20px", background: "#9ca3af", color: "#fff", borderRadius: 6, fontSize: 14 }}>
                에디터 열기
              </span>
            )}
            <a
              href={`https://${siteUrl}`}
              target="_blank"
              rel="noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 500 }}
            >
              사이트 보기
            </a>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>상품</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{productCount}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>게시판</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{boardPostCount}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>회원</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>0</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>저장 용량</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>-</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>산출 준비중</div>
          </div>
        </div>

        {/* Management Sections — 4열 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {/* 메뉴관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#ea580c", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              메뉴관리
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href={`/dashboard/site/${siteId}/manage/menus`} style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14 }}>
                메뉴 관리
              </Link>
            </div>
          </div>

          {/* 게시판관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#16a34a", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              게시판관리
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href="/dashboard/boards" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14 }}>
                게시판 생성 및 관리
              </Link>
            </div>
          </div>

          {/* 상품관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#2563eb", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              상품관리
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href="/dashboard/products" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14, borderBottom: "1px solid #f3f4f6" }}>
                상품 리스트
              </Link>
              <Link href="/dashboard/orders" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14 }}>
                주문 리스트
              </Link>
            </div>
          </div>

          {/* 회원관리 */}
          <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#374151", padding: "14px 20px", color: "#fff", fontWeight: 600, fontSize: 15 }}>
              회원관리
            </div>
            <div style={{ padding: "16px 20px" }}>
              <Link href="/admin/members" style={{ display: "block", padding: "10px 0", color: "#374151", textDecoration: "none", fontSize: 14 }}>
                회원 리스트
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
