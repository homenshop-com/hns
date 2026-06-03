import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DashboardShell from "../../dashboard-shell";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 10;

export default async function BoardPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { boardId } = await params;
  const sp = await searchParams;
  const page = parsePageParam(sp.page);

  const board = await prisma.boardCategory.findUnique({
    where: { id: boardId },
    include: { site: { select: { userId: true } } },
  });

  if (!board || board.site.userId !== session.user.id) {
    notFound();
  }

  const [posts, totalCount] = await Promise.all([
    prisma.boardPost.findMany({
      where: { categoryId: boardId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.boardPost.count({ where: { categoryId: boardId } }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const t = await getTranslations("boardsDash");

  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("breadcrumbBoards"), href: "/dashboard/boards" },
        { label: board.name },
      ]}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ marginBottom: 8 }}>
              <Link href="/dashboard/boards" style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
                &larr; {t("boardListLink")}
              </Link>
            </div>
            <h1 className="dash-title">{board.name}</h1>
            <span style={{ fontSize: 13, color: "#868e96" }}>{t("totalPosts", { count: totalCount })}</span>
          </div>
          <Link
            href={`/dashboard/boards/${boardId}/new`}
            className="dash-action-btn blue"
          >
            {t("writePost")}
          </Link>
        </div>

        {posts.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: "48px 24px", textAlign: "center", color: "#868e96", fontSize: 14 }}>
            {t("noPosts")}
            <br />
            <Link href={`/dashboard/boards/${boardId}/new`} style={{ color: "#4a90d9", textDecoration: "none", fontWeight: 600 }}>
              {t("writeFirstPost")}
            </Link>
          </div>
        ) : (
          <div className="dash-table">
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>{t("colTitle")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>{t("colAuthor")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: "#495057" }}>{t("colViews")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: "#495057" }}>{t("colDate")}</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <Link href={`/dashboard/boards/${boardId}/posts/${post.id}`} style={{ color: "#1a1a2e", fontWeight: 600, textDecoration: "none" }}>
                        {post.title}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center", color: "#495057" }}>{post.author}</td>
                    <td style={{ padding: "12px 20px", textAlign: "right", color: "#868e96" }}>{post.views}</td>
                    <td style={{ padding: "12px 20px", textAlign: "right", color: "#868e96" }}>
                      {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {page > 1 && (
              <Link href={`/dashboard/boards/${boardId}?page=${page - 1}`} className="dash-manage-btn">{t("prev")}</Link>
            )}
            <span style={{ fontSize: 13, color: "#868e96" }}>{t("pageOf", { page, totalPages })}</span>
            {page < totalPages && (
              <Link href={`/dashboard/boards/${boardId}?page=${page + 1}`} className="dash-manage-btn">{t("next")}</Link>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
