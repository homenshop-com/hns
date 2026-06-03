"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface Category {
  id: string;
  lang: string;
  category: string;
  rows: string;
  list_style: string;
  post_count: string;
}

export default function BoardCategoriesClient() {
  const t = useTranslations("boardsDash");
  const listStyleLabels: Record<string, string> = {
    "0": t("listStyleList"),
    "1": t("listStyleGallery"),
    "2": t("listStyleSlideshow"),
  };
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
      setError(t("loadCategoriesError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        throw new Error(d.error || t("createFailed"));
      }
      setNewName("");
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorOccurred"));
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
        throw new Error(d.error || t("updateFailed"));
      }
      setEditId(null);
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorOccurred"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(t("confirmDeleteCategory", { name }))) return;
    setError("");
    try {
      const res = await fetch(`/api/board-categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || t("deleteFailed"));
      }
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorOccurred"));
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
            &larr; {t("postManageLink")}
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">{t("categoriesTitle")}</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-6">{t("totalCategories", { count: categories.length })}</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{error}</div>
        )}

        {/* Add new category */}
        <form onSubmit={handleCreate} className="mb-6 flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-zinc-500 mb-1">{t("categoryName")}</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t("newCategoryPlaceholder")}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">{t("language")}</label>
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
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#3182f6] px-4 h-10 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(49,130,246,0.25),0_2px_6px_rgba(49,130,246,0.18)] transition hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-plus" aria-hidden="true" />
            {t("add")}
          </button>
        </form>

        {/* Category list */}
        {loading ? (
          <div className="text-center py-12 text-zinc-400">{t("loadingShort")}</div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500">{t("noCategories")}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400 w-10">{t("colId")}</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400 w-12">{t("language")}</th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">{t("categoryName")}</th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">{t("displayMode")}</th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">{t("rowCount")}</th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">{t("colPostsHeader")}</th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400 w-32">{t("colActions")}</th>
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
                            <option value="0">{t("listStyleList")}</option>
                            <option value="1">{t("listStyleGallery")}</option>
                            <option value="2">{t("listStyleSlideshow")}</option>
                          </select>
                        ) : (
                          <span className="text-zinc-500">{listStyleLabels[cat.list_style] || cat.list_style}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {isEditing ? (
                          <input type="number" value={editRows} onChange={e => setEditRows(e.target.value)} className={`${inputCls} w-16 text-center`} />
                        ) : (
                          <span className="text-zinc-500">{cat.rows}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-zinc-500">{t("countSuffix", { count: cat.post_count })}</td>
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <span className="flex gap-1 justify-end">
                            <button onClick={() => handleUpdate(cat.id)} disabled={saving}
                              className="inline-flex items-center gap-1 rounded bg-[#3182f6] px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50">
                              <i className="fa-solid fa-check" aria-hidden="true" />
                              {t("save")}
                            </button>
                            <button onClick={() => setEditId(null)}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300">
                              <i className="fa-solid fa-xmark" aria-hidden="true" />
                              {t("cancel")}
                            </button>
                          </span>
                        ) : (
                          <span className="flex gap-1 justify-end">
                            <button onClick={() => startEdit(cat)}
                              className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                              {t("edit")}
                            </button>
                            <button onClick={() => handleDelete(cat.id, cat.category)}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950">
                              {t("delete")}
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
          &larr; {t("backToPostManage")}
        </Link>
      </div>
    </div>
  );
}
