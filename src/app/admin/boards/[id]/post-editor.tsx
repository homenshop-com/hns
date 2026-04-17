"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PostData {
  id: string;
  title: string;
  author: string;
  content: string;
  isNotice: boolean;
  isPublic: boolean;
  views: number;
  createdAt: string;
  regdate: string;
  photos: string;
  siteShopId: string;
  categoryName: string;
  lang: string;
  replyCount: number;
}

interface Reply {
  id: string;
  title: string;
  author: string;
  createdAt: string;
}

export default function PostEditor({ post, replies }: { post: PostData; replies: Reply[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [author, setAuthor] = useState(post.author);
  const [content, setContent] = useState(post.content);
  const [isNotice, setIsNotice] = useState(post.isNotice);
  const [isPublic, setIsPublic] = useState(post.isPublic);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const res = await fetch("/api/admin/boards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, title, author, content, isNotice, isPublic }),
    });

    if (res.ok) {
      setSaved(true);
      setEditing(false);
      startTransition(() => router.refresh());
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert("저장 실패");
    }
  }

  async function handleDelete() {
    if (!confirm("이 게시물을 삭제하시겠습니까? (댓글 포함)")) return;

    const res = await fetch("/api/admin/boards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [post.id] }),
    });

    if (res.ok) {
      router.push("/admin/boards");
      router.refresh();
    } else {
      alert("삭제 실패");
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#405189]/50 focus:ring-1 focus:ring-[#405189]/30 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      {/* Meta info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-500 text-xs">사이트</span>
            <p className="text-slate-800 mt-0.5">{post.siteShopId}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">카테고리</span>
            <p className="text-slate-800 mt-0.5">{post.categoryName || "-"}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">조회수</span>
            <p className="text-slate-800 mt-0.5">{post.views.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">작성일</span>
            <p className="text-slate-800 mt-0.5">{post.regdate || new Date(post.createdAt).toLocaleDateString("ko-KR")}</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {!editing ? (
          <>
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#405189]"
            >
              수정
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              삭제
            </button>
            {saved && (
              <span className="text-sm text-green-400 ml-2">저장됨!</span>
            )}
          </>
        ) : (
          <>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#405189] disabled:opacity-50"
            >
              {isPending ? "저장중..." : "저장"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setTitle(post.title);
                setAuthor(post.author);
                setContent(post.content);
                setIsNotice(post.isNotice);
                setIsPublic(post.isPublic);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              취소
            </button>
          </>
        )}
      </div>

      {/* Edit form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={!editing}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">작성자</label>
            <input
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              disabled={!editing}
              className={inputCls}
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isNotice}
                onChange={e => setIsNotice(e.target.checked)}
                disabled={!editing}
                className="rounded border-slate-300 bg-slate-100 text-[#405189]"
              />
              공지사항
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
                disabled={!editing}
                className="rounded border-slate-300 bg-slate-100 text-[#405189]"
              />
              공개
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">내용</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={!editing}
            rows={15}
            className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
          />
        </div>

        {post.photos && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">첨부 사진</label>
            <p className="text-xs text-slate-600 break-all">{post.photos}</p>
          </div>
        )}
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">댓글 ({replies.length})</h3>
          <div className="space-y-2">
            {replies.map(r => (
              <div key={r.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <span className="text-sm text-slate-800">{r.title || "(내용)"}</span>
                  <span className="ml-2 text-xs text-slate-500">{r.author}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
