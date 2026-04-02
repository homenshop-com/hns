import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import CommentSection from "./comment-section";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ boardId: string; postId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { boardId, postId } = await params;

  const post = await prisma.boardPost.findFirst({
    where: { id: postId, boardId },
    include: {
      board: { include: { site: { select: { userId: true } } } },
    },
  });

  if (!post || post.board.site.userId !== session.user.id) notFound();

  await prisma.boardPost.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  });

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">HomeNShop</Link>
            <span className="dash-logo-sub">게시글</span>
          </div>
          <div className="dash-header-right">
            <span className="dash-user-info">{session.user.name}</span>
            <Link href="/dashboard" className="dash-header-btn">대시보드</Link>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/boards/${boardId}`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 게시글 목록
          </Link>
        </div>

        <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          {/* Post Header */}
          <div style={{ borderBottom: "1px solid #e2e8f0", padding: "20px 24px" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>{post.title}</h2>
            <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 13, color: "#868e96" }}>
              <span>작성자: {post.author}</span>
              <span>작성일: {new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</span>
              <span>조회수: {post.views + 1}</span>
            </div>
          </div>

          {/* Post Content */}
          <div style={{ padding: "24px", minHeight: 200, whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.8, color: "#1a1a2e" }}>
            {post.content}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Link href={`/dashboard/boards/${boardId}/posts/${postId}/edit`} className="dash-action-btn blue">
            수정
          </Link>
          <DeletePostButton boardId={boardId} postId={postId} />
        </div>

        {/* Comments */}
        <CommentSection boardId={boardId} postId={postId} />
      </main>

      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function DeletePostButton({ boardId, postId }: { boardId: string; postId: string }) {
  return (
    <form
      action={async () => {
        "use server";
        const session = await auth();
        if (!session) return;
        const post = await prisma.boardPost.findFirst({
          where: { id: postId, boardId },
          include: { board: { include: { site: { select: { userId: true } } } } },
        });
        if (!post || post.board.site.userId !== session.user.id) return;
        await prisma.boardPost.delete({ where: { id: postId } });
        const { redirect } = await import("next/navigation");
        redirect(`/dashboard/boards/${boardId}`);
      }}
    >
      <button type="submit" style={{ padding: "8px 18px", fontSize: 13, fontWeight: 700, background: "#fff", color: "#e03131", border: "1.5px solid #e03131", borderRadius: 6, cursor: "pointer" }}>
        삭제
      </button>
    </form>
  );
}
