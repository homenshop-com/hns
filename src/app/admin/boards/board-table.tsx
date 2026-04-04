"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Post {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  views: number;
  lang: string;
  siteShopId: string;
  categoryName: string;
  replyCount: number;
}

export default function BoardTable({ posts, currentPage, totalPages, qsBase }: {
  posts: Post[];
  currentPage: number;
  totalPages: number;
  qsBase: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const allChecked = posts.length > 0 && selected.size === posts.length;

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map(p => p.id)));
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개 게시물을 삭제하시겠습니까? (댓글 포함)`)) return;

    const res = await fetch("/api/admin/boards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });

    if (res.ok) {
      const data = await res.json();
      setSelected(new Set());
      startTransition(() => router.refresh());
      alert(`${data.deleted}개 게시물이 삭제되었습니다.`);
    } else {
      alert("삭제 실패");
    }
  }

  function pageUrl(p: number) {
    const sep = qsBase.includes("?") ? "&" : "?";
    return p > 1 ? `/admin/boards${qsBase}${sep}page=${p}` : `/admin/boards${qsBase}`;
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
          <span className="text-sm text-red-400 font-medium">{selected.size}개 선택됨</span>
          <button
            onClick={bulkDelete}
            disabled={isPending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? "삭제중..." : "선택 삭제"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-md border border-slate-600/40 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800/40"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/20 bg-slate-800/30 text-left">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">제목</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-20">사이트</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-24">카테고리</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-24">작성자</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider text-right w-14">조회</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider text-right w-14">댓글</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-24">작성일</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr
                key={post.id}
                className={`border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30 ${selected.has(post.id) ? "bg-cyan-500/5" : ""}`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(post.id)}
                    onChange={() => toggle(post.id)}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                  />
                </td>
                <td className="px-4 py-3 max-w-sm">
                  <Link
                    href={`/admin/boards/${post.id}`}
                    className="font-medium text-slate-200 hover:text-cyan-400 transition-colors line-clamp-1"
                  >
                    {post.title || "(제목없음)"}
                  </Link>
                  {post.lang && post.lang !== "ko" && (
                    <span className="ml-2 text-[10px] text-slate-500 uppercase">{post.lang}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                  {post.siteShopId}
                </td>
                <td className="px-4 py-3">
                  {post.categoryName && post.categoryName !== "-" ? (
                    <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
                      {post.categoryName}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap truncate max-w-[100px]">
                  {post.author || "-"}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 text-xs">
                  {post.views}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 text-xs">
                  {post.replyCount > 0 ? post.replyCount : "-"}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                  게시물이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {currentPage > 1 && (
            <Link href={pageUrl(currentPage - 1)} className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800/40">
              이전
            </Link>
          )}
          <span className="text-sm text-slate-500">
            {currentPage} / {totalPages} 페이지
          </span>
          {currentPage < totalPages && (
            <Link href={pageUrl(currentPage + 1)} className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800/40">
              다음
            </Link>
          )}
        </div>
      )}
    </>
  );
}
