import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import PostEditor from "./post-editor";

export default async function AdminBoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const post = await prisma.boardPost.findUnique({
    where: { id },
    include: {
      site: { select: { shopId: true, name: true } },
      category: { select: { name: true } },
      replies: {
        select: { id: true, title: true, author: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!post) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/boards"
            className="text-sm text-slate-500 hover:text-[#405189] transition-colors"
          >
            &larr; 목록
          </Link>
          <h1 className="text-xl font-bold text-slate-900">게시물 상세</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{post.site?.shopId}</span>
          <span>/</span>
          <span>{post.category?.name || "-"}</span>
          <span>/</span>
          <span>{post.lang}</span>
        </div>
      </div>

      <PostEditor
        post={{
          id: post.id,
          title: post.title,
          author: post.author,
          content: post.content,
          isNotice: post.isNotice,
          isPublic: post.isPublic,
          views: post.views,
          createdAt: post.createdAt.toISOString(),
          regdate: post.regdate || "",
          photos: post.photos || "",
          siteShopId: post.site?.shopId || "",
          categoryName: post.category?.name || "",
          lang: post.lang,
          replyCount: post.replies.length,
        }}
        replies={post.replies.map(r => ({
          id: r.id,
          title: r.title,
          author: r.author,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
