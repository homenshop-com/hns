"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TiptapEditor = lazy(() => import("@/components/tiptap-editor"));

interface BoardPost {
  id: string;
  title: string;
  username: string;
  regdate: string;
  click: string;
  category: string;
  categoryName: string;
  photos: string;
  notice: string;
  contents?: string;
}

interface BoardCategory {
  id: string;
  lang: string;
  category: string;
  cnt: string;
}

export default function BoardPostsClient() {
  const searchParams = useSearchParams();
  const initialCat = searchParams.get("category") || "";

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterCat, setFilterCat] = useState(initialCat);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Detail/Edit state
  const [editPost, setEditPost] = useState<BoardPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContents, setEditContents] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // New post state
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContents, setNewContents] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const limit = 20;

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterCat) params.set("category", filterCat);
      const res = await fetch(`/api/legacy-boards?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setCategories(data.categories || []);
      setTotal(data.total || 0);
    } catch {
      setError("게시물을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, filterCat]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function openEdit(postId: string) {
    try {
      const res = await fetch(`/api/legacy-boards?id=${postId}`);
      const data = await res.json();
      if (data.post) {
        setEditPost(data.post);
        setEditTitle(data.post.title || "");
        setEditContents(data.post.contents || "");
        setEditUsername(data.post.username || "");
        setEditCategory(String(data.post.category || ""));
        setShowNew(false);
      }
    } catch {
      setError("게시물을 불러올 수 없습니다.");
    }
  }

  async function handleUpdate() {
    if (!editPost) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/legacy-boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editPost.id,
          title: editTitle,
          contents: editContents,
          username: editUsername,
          category: editCategory,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "수정 실패");
      }
      setEditPost(null);
      fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 게시물을 삭제하시겠습니까?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/legacy-boards?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "삭제 실패");
      }
      if (editPost?.id === id) setEditPost(null);
      fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    }
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/legacy-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          contents: newContents,
          username: newUsername || undefined,
          category: newCategory || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "생성 실패");
      }
      setNewTitle("");
      setNewContents("");
      setNewUsername("");
      setShowNew(false);
      fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div>
      <div className="mb-6">
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            &larr; 대시보드
          </Link>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">게시물 관리</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              총 {total}건
              {filterCat && categories.find(c => c.id === filterCat) && (
                <span> &middot; {categories.find(c => c.id === filterCat)!.category}</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/boards/categories"
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              카테고리 관리
            </Link>
            <button
              onClick={() => { setShowNew(!showNew); setEditPost(null); }}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {showNew ? "취소" : "+ 게시물 등록"}
            </button>
          </div>
        </div>

        {/* Category filter */}
        {categories.filter(c => c.category !== "Default").length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-zinc-500">카테고리:</span>
            <button
              onClick={() => { setFilterCat(""); setPage(1); }}
              className={`px-2.5 py-1 rounded text-xs font-medium ${!filterCat ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400"}`}
            >
              전체
            </button>
            {categories.filter(c => c.category !== "Default").map(c => (
              <button
                key={c.id}
                onClick={() => { setFilterCat(c.id); setPage(1); }}
                className={`px-2.5 py-1 rounded text-xs font-medium ${filterCat === c.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400"}`}
              >
                {c.category} ({c.cnt})
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{error}</div>
        )}

        {/* New post form */}
        {showNew && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold mb-4">새 게시물 작성</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">제목</label>
                  <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} className={inputCls} placeholder="제목" />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">작성자</label>
                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className={inputCls} placeholder="admin" />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">카테고리</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className={inputCls}>
                    <option value="">선택</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.category}{c.lang ? ` (${c.lang.toUpperCase()})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">내용</label>
                <Suspense fallback={<div className="border border-zinc-300 rounded-lg p-4 text-zinc-400 text-sm">에디터 로딩중...</div>}>
                  <TiptapEditor initialHtml={newContents} onChange={setNewContents} minHeight={200} />
                </Suspense>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNew(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">취소</button>
                <button onClick={handleCreate} disabled={saving || !newTitle.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                  {saving ? "저장중..." : "등록"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit form */}
        {editPost && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold mb-4">게시물 수정 <span className="text-sm font-normal text-zinc-400">#{editPost.id}</span></h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">제목</label>
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className={inputCls} />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">작성자</label>
                  <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} className={inputCls} />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">카테고리</label>
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inputCls}>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.category}{c.lang ? ` (${c.lang.toUpperCase()})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">내용</label>
                <Suspense fallback={<div className="border border-zinc-300 rounded-lg p-4 text-zinc-400 text-sm">에디터 로딩중...</div>}>
                  <TiptapEditor initialHtml={editContents} onChange={setEditContents} minHeight={300} />
                </Suspense>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditPost(null)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">취소</button>
                <button onClick={handleUpdate} disabled={saving} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                  {saving ? "저장중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Post list */}
        {loading ? (
          <div className="text-center py-12 text-zinc-400">불러오는 중...</div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500">게시물이 없습니다.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400 w-12">ID</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">제목</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">카테고리</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">작성자</th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">날짜</th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">조회</th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400 w-28">작업</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr key={post.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                    <td className="px-6 py-4 text-zinc-400">{post.id}</td>
                    <td className="px-6 py-4">
                      <button onClick={() => openEdit(post.id)} className="font-medium text-left hover:underline">
                        {post.title || "(제목 없음)"}
                      </button>
                      {post.photos && <span className="ml-1 text-xs text-zinc-400">📷</span>}
                      {post.notice === "1" && <span className="ml-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">공지</span>}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">{post.categoryName || "-"}</td>
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">{post.username}</td>
                    <td className="px-6 py-4 text-center text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{post.regdate}</td>
                    <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400">{Number(post.click).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(post.id)}
                          className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                          수정
                        </button>
                        <button onClick={() => handleDelete(post.id, post.title)}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950">
                          삭제
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1">
            {page > 1 && (
              <button onClick={() => setPage(page - 1)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">이전</button>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                typeof p === "string" ? (
                  <span key={`e-${idx}`} className="px-2 text-sm text-zinc-400">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      p === page
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            {page < totalPages && (
              <button onClick={() => setPage(page + 1)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">다음</button>
            )}
          </div>
        )}

        <div className="mt-6">
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            &larr; 대시보드로 돌아가기
          </Link>
        </div>
    </div>
  );
}
