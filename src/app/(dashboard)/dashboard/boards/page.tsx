import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DashboardShell from "../dashboard-shell";

export default async function BoardsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("boardsPage");

  // Fetch ALL user sites with their board categories and post counts
  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      shopId: true,
      boardCategories: {
        orderBy: { legacyId: "asc" },
        select: {
          id: true,
          legacyId: true,
          name: true,
          lang: true,
          _count: { select: { posts: { where: { parentId: null } } } },
        },
      },
    },
  });

  const totalBoardCount = sites.reduce((s, site) => s + site.boardCategories.length, 0);
  const totalPostCount  = sites.reduce(
    (s, site) => s + site.boardCategories.reduce((ss, b) => ss + b._count.posts, 0),
    0
  );

  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: t("title") },
      ]}
    >
      <div>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 className="dash-title">{t("title")}</h1>
          <span style={{ fontSize: 13, color: "#868e96" }}>
            총 {totalBoardCount}개 게시판 · {totalPostCount}건
          </span>
        </div>

        {sites.length === 0 && (
          <div style={{
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
            padding: "48px 24px",
            textAlign: "center",
            color: "#868e96",
            fontSize: 14,
          }}>
            사이트를 먼저 생성해주세요.
            <br />
            <Link href="/dashboard/templates" style={{ color: "#4a90d9", textDecoration: "none", fontWeight: 600 }}>
              사이트 만들기
            </Link>
          </div>
        )}

        {/* One card per site */}
        {sites.map((site) => {
          const siteName = site.name || site.shopId;
          const visibleBoards = site.boardCategories.filter(
            (b) => b.name && b.name !== "Default" && b.name !== "DefaultCategories"
          );
          const sitePostCount = site.boardCategories.reduce((s, b) => s + b._count.posts, 0);

          return (
            <div
              key={site.id}
              style={{
                background: "#fff",
                borderRadius: 10,
                boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
                marginBottom: 20,
                overflow: "hidden",
              }}
            >
              {/* Site header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid #f1f3f5",
                background: "#f8f9fa",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>
                    {siteName}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: "#868e96",
                    background: "#e9ecef",
                    padding: "2px 8px",
                    borderRadius: 20,
                  }}>
                    {site.shopId}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#868e96" }}>
                    {visibleBoards.length}개 · 총 {sitePostCount}건
                  </span>
                  <Link
                    href={`/dashboard/site/${site.id}/manage`}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#4a90d9",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    게시판 관리 →
                  </Link>
                </div>
              </div>

              {/* All-posts shortcut row */}
              <Link
                href={`/dashboard/boards/posts?siteId=${site.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 20px",
                  borderBottom: visibleBoards.length > 0 ? "1px solid #f1f3f5" : undefined,
                  textDecoration: "none",
                  color: "inherit",
                  background: "#fff",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600, color: "#4a90d9" }}>전체 게시글 보기</span>
                <span style={{ color: "#868e96" }}>{sitePostCount}건</span>
              </Link>

              {/* Board rows */}
              {visibleBoards.length === 0 ? (
                <div style={{ padding: "20px", fontSize: 13, color: "#adb5bd", textAlign: "center" }}>
                  등록된 게시판이 없습니다.{" "}
                  <Link
                    href={`/dashboard/site/${site.id}/manage`}
                    style={{ color: "#4a90d9", textDecoration: "none", fontWeight: 600 }}
                  >
                    관리 페이지에서 추가
                  </Link>
                </div>
              ) : (
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <tbody>
                    {visibleBoards.map((board) => (
                      <tr
                        key={board.id}
                        style={{ borderBottom: "1px solid #f8f9fa" }}
                      >
                        <td style={{ padding: "10px 20px" }}>
                          <Link
                            href={`/dashboard/boards/posts?category=${board.legacyId ?? board.id}&siteId=${site.id}`}
                            style={{ color: "#1a1a2e", fontWeight: 500, textDecoration: "none" }}
                          >
                            {board.name}
                          </Link>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {board.lang && (
                            <span style={{
                              display: "inline-block",
                              padding: "1px 8px",
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 20,
                              background: "#f1f3f5",
                              color: "#495057",
                            }}>
                              {board.lang}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 20px", textAlign: "right", color: "#495057" }}>
                          <Link
                            href={`/dashboard/boards/posts?category=${board.legacyId ?? board.id}&siteId=${site.id}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {board._count.posts}건
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </DashboardShell>
  );
}
