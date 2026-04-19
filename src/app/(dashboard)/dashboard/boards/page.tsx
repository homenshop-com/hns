import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CreateBoardForm from "./create-board-form";

export default async function BoardsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("boardsPage");
  const td = await getTranslations("dashboard");

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  const boards = site
    ? await prisma.boardCategory.findMany({
        where: { siteId: site.id },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { posts: true } },
        },
      })
    : [];

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">homeNshop</Link>
            <span className="dash-logo-sub">{t("title")}</span>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 className="dash-title">{t("title")}</h1>
          <span style={{ fontSize: 13, color: "#868e96" }}>총 {boards.length}개의 게시판</span>
        </div>

        {!site && (
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: "48px 24px", textAlign: "center", marginBottom: 24, color: "#868e96", fontSize: 14 }}>
            사이트를 먼저 생성해주세요.
            <br />
            <Link href="/dashboard/templates" style={{ color: "#4a90d9", textDecoration: "none", fontWeight: 600 }}>사이트 만들기</Link>
          </div>
        )}

        {site && boards.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: "48px 24px", textAlign: "center", marginBottom: 24, color: "#868e96", fontSize: 14 }}>
            등록된 게시판이 없습니다.
          </div>
        )}

        {boards.length > 0 && (
          <div className="dash-table" style={{ marginBottom: 24 }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>게시판명</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>언어</th>
                  <th style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: "#495057" }}>게시글 수</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((board) => (
                  <tr key={board.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <Link href={`/dashboard/boards/${board.id}`} style={{ color: "#1a1a2e", fontWeight: 600, textDecoration: "none" }}>
                        {board.name}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: "#f8f9fa", color: "#495057" }}>
                        {board.lang}
                      </span>
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "right" }}>{board._count.posts}개</td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      <DeleteBoardButton boardId={board.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {site && <CreateBoardForm />}
      </main>

      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function DeleteBoardButton({ boardId }: { boardId: string }) {
  return (
    <form
      action={async () => {
        "use server";
        const session = await auth();
        if (!session) return;
        const board = await prisma.boardCategory.findUnique({
          where: { id: boardId },
          include: { site: { select: { userId: true } } },
        });
        if (!board || board.site.userId !== session.user.id) return;
        await prisma.boardCategory.delete({ where: { id: boardId } });
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/dashboard/boards");
      }}
    >
      <button type="submit" style={{ fontSize: 12, color: "#e03131", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
        삭제
      </button>
    </form>
  );
}
