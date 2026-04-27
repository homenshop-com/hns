"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Category {
  id: string;
  lang: string;
  category: string;
  rows: string;
  list_style: string;
  post_count: string;
}

const LISTSTYLE_LABELS: Record<string, string> = {
  "0": "리스트",
  "1": "갤러리",
  "2": "슬라이드쇼",
};

export default function BoardCategoriesClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRows, setEditRows] = useState("20");
  const [editListStyle, setEditListStyle] = useState("0");
  const [newName, setNewName] = useState("");
  const [newLang, setNewLang] = useState("en");
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/board-categories");
      const data = await res.json();
      if (data.categories) {
        setCategories(data.categories);
        if (data.defaultLanguage) setNewLang(data.defaultLanguage);
      }
    } catch {
      setError("카테고리를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/board-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newName.trim(), lang: newLang }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "생성 실패");
      }
      setNewName("");
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/board-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, category: editName, rows: editRows, list_style: editListStyle }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "수정 실패");
      }
      setEditId(null);
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 카테고리를 삭제하시겠습니까?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/board-categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "삭제 실패");
      }
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    }
  }

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setEditName(cat.category);
    setEditRows(cat.rows || "20");
    setEditListStyle(cat.list_style || "0");
  }

  const inputCls = "rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div>
      <div className="mb-6">
          <Link href="/dashboard/boards/posts" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            &larr; 게시물 관리
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">게시판 카테고리 관리</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-6">총 {categories.length}개 카테고리</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{error}</div>
        )}

        {/* Add new category */}
        <form onSubmit={handleCreate} className="mb-6 flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-zinc-500 mb-1">카테고리명</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="새 카테고리명"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">언어</label>
            <select
              value={newLang}
              onChange={e => setNewLang(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="ko">KO</option>
              <option value="en">EN</option>
              <option value="ja">JA</option>
              <option value="zh-cn">ZH-CN</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            추가
          </button>
        </form>

        {/* Category list */}
        {loading ? (
          <div className="text-center py-12 text-zinc-400">불러오는 중...</div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500">등록된 카테고리가 없습니다.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400 w-10">ID</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400 w-12">언어</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">카테고리명</th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">표시방식</th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">행수</th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">게시물</th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400 w-32">작업</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const isEditing = editId === cat.id;
                  return (
                    <tr key={cat.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                      <td className="px-6 py-3 text-zinc-400">{cat.id}</td>
                      <td className="px-6 py-3">
                        <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {(cat.lang || "-").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {isEditing ? (
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={`${inputCls} w-full`} />
                        ) : (
                          <span className="font-medium">{cat.category}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {isEditing ? (
                          <select value={editListStyle} onChange={e => setEditListStyle(e.target.value)} className={inputCls}>
                            <option value="0">리스트</option>
                            <option value="1">갤러리</option>
                            <option value="2">슬라이드쇼</option>
                          </select>
                        ) : (
                          <span className="text-zinc-500">{LISTSTYLE_LABELS[cat.list_style] || cat.list_style}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {isEditing ? (
                          <input type="number" value={editRows} onChange={e => setEditRows(e.target.value)} className={`${inputCls} w-16 text-center`} />
                        ) : (
                          <span className="text-zinc-500">{cat.rows}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-zinc-500">{cat.post_count}건</td>
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <span className="flex gap-1 justify-end">
                            <button onClick={() => handleUpdate(cat.id)} disabled={saving}
                              className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                              저장
                            </button>
                            <button onClick={() => setEditId(null)}
                              className="rounded border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                              취소
                            </button>
                          </span>
                        ) : (
                          <span className="flex gap-1 justify-end">
                            <button onClick={() => startEdit(cat)}
                              className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                              수정
                            </button>
                            <button onClick={() => handleDelete(cat.id, cat.category)}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950">
                              삭제
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      <div className="mt-6">
        <Link href="/dashboard/boards/posts" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          &larr; 게시물 관리로 돌아가기
        </Link>
      </div>
    </div>
  );
}
