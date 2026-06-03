"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import React from "react";

interface Category {
  id: string;
  lang: string;
  category: string;
  parent: string;
  liststyle: string;
  rows: string;
  img_w: string;
  img_h: string;
  defaultkey: string;
}

export default function CategoriesClient({ siteId }: { siteId?: string }) {
  const tp = useTranslations("productsDash");
  const listStyleLabels: Record<string, string> = {
    "0": tp("listStyleList"),
    "1": tp("listStyleGallery"),
    "2": tp("listStyleSlideshow"),
  };
  const listHref = siteId ? `/dashboard/products?siteId=${siteId}` : "/dashboard/products";
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editListstyle, setEditListstyle] = useState("0");
  const [editRows, setEditRows] = useState("9");
  const [editImgW, setEditImgW] = useState("80");
  const [editImgH, setEditImgH] = useState("80");
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("0");
  const [newLang, setNewLang] = useState("en");
  const [saving, setSaving] = useState(false);
  const [defaultLang, setDefaultLang] = useState("ko");
  const [filterLang, setFilterLang] = useState("");
  /* 2026-05-17 사용자 보고: 언어 선택 후 셀렉터가 사라지는 버그.
     원인: langs를 현재 categories에서 파생 → 필터 적용 후 langs.length=1
     이 되어 selector 자체가 unmount됨. 해결: 전체 언어 목록은 별도 state
     로 보관하고 filter 없이 fetch한 결과로만 업데이트. */
  const [allLangs, setAllLangs] = useState<string[]>([]);

  const fetchCategories = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterLang) params.set("lang", filterLang);
      if (siteId) params.set("siteId", siteId);
      const qs = params.toString();
      const url = `/api/product-categories${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.categories) {
        setCategories(data.categories);
        // 전체 fetch일 때만 allLangs 업데이트 (선택바 안 사라지게)
        if (!filterLang) {
          const ls = [...new Set((data.categories as Category[]).map((c) => c.lang))].sort();
          setAllLangs(ls);
        }
        if (data.defaultLanguage) {
          setDefaultLang(data.defaultLanguage);
          if (!newLang) setNewLang(data.defaultLanguage);
        }
      }
    } catch {
      setError(tp("loadCategoriesError"));
    } finally {
      setLoading(false);
    }
  }, [filterLang, siteId, tp]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // 전체 언어 목록 — filter와 무관하게 항상 같은 값
  const langs = allLangs;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newName.trim(),
          lang: newLang,
          parent: newParent,
          ...(siteId ? { siteId } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tp("createFailed"));
      }
      setNewName("");
      setNewParent("0");
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("errorOccurred"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/product-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          category: editName,
          liststyle: editListstyle,
          rows: editRows,
          img_w: editImgW,
          img_h: editImgH,
          ...(siteId ? { siteId } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tp("updateFailed"));
      }
      setEditId(null);
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("errorOccurred"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(tp("confirmDeleteCategory", { name }))) return;
    setError("");
    try {
      const res = await fetch(`/api/product-categories?id=${id}${siteId ? `&siteId=${siteId}` : ""}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tp("deleteFailed"));
      }
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("errorOccurred"));
    }
  }

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setEditName(cat.category);
    setEditListstyle(cat.liststyle || "0");
    setEditRows(cat.rows || "9");
    setEditImgW(cat.img_w || "80");
    setEditImgH(cat.img_h || "80");
  }

  // Build flat list with depth info (SQLite returns numbers, so compare as strings)
  const roots = categories.filter(c => String(c.parent) === "0");
  const getChildren = (parentId: string) => categories.filter(c => String(c.parent) === String(parentId));
  const flatList: { cat: Category; depth: number }[] = [];
  for (const root of roots) {
    flatList.push({ cat: root, depth: 0 });
    for (const child of getChildren(root.id)) {
      flatList.push({ cat: child, depth: 1 });
    }
  }

  const inputCls = "rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div>
      <div className="mb-6">
          <Link href={listHref} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            &larr; {tp("productList")}
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">{tp("categoriesTitle")}</h2>
          {langs.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{tp("languageLabel")}</span>
              <button
                onClick={() => setFilterLang("")}
                className={`px-3 h-7 rounded-full text-xs font-medium transition ${!filterLang ? "bg-[#3182f6] text-white shadow-sm" : "bg-white border border-zinc-200 text-zinc-600 hover:border-[#3182f6] hover:text-[#3182f6] dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400"}`}
              >
                {tp("filterAll")}
              </button>
              {langs.map(l => (
                <button
                  key={l}
                  onClick={() => setFilterLang(l)}
                  className={`px-3 h-7 rounded-full text-xs font-medium transition ${filterLang === l ? "bg-[#3182f6] text-white shadow-sm" : "bg-white border border-zinc-200 text-zinc-600 hover:border-[#3182f6] hover:text-[#3182f6] dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm text-zinc-500 mb-6">{tp("totalCategories", { count: categories.length })}</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Add new category */}
        <form onSubmit={handleCreate} className="mb-6 flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-zinc-500 mb-1">{tp("categoryNameLabel")}</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={tp("newCategoryPlaceholder")}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">{tp("language")}</label>
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
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">{tp("parentCategory")}</label>
            <select
              value={newParent}
              onChange={e => setNewParent(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="0">{tp("parentNone")}</option>
              {roots.map(r => (
                <option key={r.id} value={r.id}>{r.category}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#3182f6] px-4 h-10 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(49,130,246,0.25),0_2px_6px_rgba(49,130,246,0.18)] transition hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-plus" aria-hidden="true" />
            <span>{tp("add")}</span>
          </button>
        </form>

        {/* Category list */}
        {loading ? (
          <div className="text-center py-12 text-zinc-400">{tp("loading")}</div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500">{tp("noCategories")}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 w-10">{tp("colId")}</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 w-12">{tp("colLang")}</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">{tp("colCategoryName")}</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-500">{tp("colDisplayStyle")}</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-500">{tp("colRows")}</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-500">{tp("colImageSize")}</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-500 w-32">{tp("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {flatList.map(({ cat, depth }) => {
                  const isEditing = editId === cat.id;
                  return (
                    <tr key={cat.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3 text-zinc-400">{cat.id}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {cat.lang.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={`${inputCls} w-full`} />
                        ) : (
                          <span style={{ paddingLeft: depth * 20 }}>
                            {depth > 0 && <span className="text-zinc-300 mr-1">└</span>}
                            <span className="font-medium">{cat.category}</span>
                            {cat.defaultkey === "1" && <span className="ml-1 text-xs text-blue-500">{tp("defaultMark")}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <select value={editListstyle} onChange={e => setEditListstyle(e.target.value)} className={inputCls}>
                            <option value="0">{tp("listStyleList")}</option>
                            <option value="1">{tp("listStyleGallery")}</option>
                            <option value="2">{tp("listStyleSlideshow")}</option>
                          </select>
                        ) : (
                          <span className="text-zinc-500">{listStyleLabels[cat.liststyle] || cat.liststyle}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <input type="number" value={editRows} onChange={e => setEditRows(e.target.value)} className={`${inputCls} w-16 text-center`} />
                        ) : (
                          <span className="text-zinc-500">{cat.rows}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <span className="flex items-center justify-center gap-1">
                            <input type="number" value={editImgW} onChange={e => setEditImgW(e.target.value)} className={`${inputCls} w-14 text-center`} />
                            <span className="text-zinc-400">x</span>
                            <input type="number" value={editImgH} onChange={e => setEditImgH(e.target.value)} className={`${inputCls} w-14 text-center`} />
                          </span>
                        ) : (
                          <span className="text-zinc-500">{cat.img_w}x{cat.img_h}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <span className="flex gap-1 justify-end">
                            <button onClick={() => handleUpdate(cat.id)} disabled={saving}
                              className="inline-flex items-center gap-1 rounded bg-[#3182f6] px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50">
                              <i className="fa-solid fa-check" aria-hidden="true" />
                              {tp("save")}
                            </button>
                            <button onClick={() => setEditId(null)}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300">
                              <i className="fa-solid fa-xmark" aria-hidden="true" />
                              {tp("cancel")}
                            </button>
                          </span>
                        ) : (
                          <span className="flex gap-1 justify-end">
                            <button onClick={() => startEdit(cat)}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-[#3182f6] hover:text-[#3182f6]">
                              <i className="fa-solid fa-pen" aria-hidden="true" />
                              {tp("edit")}
                            </button>
                            <button onClick={() => handleDelete(cat.id, cat.category)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-500 hover:bg-red-50">
                              <i className="fa-solid fa-trash" aria-hidden="true" />
                              {tp("delete")}
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
        <Link href={listHref} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          &larr; {tp("backToProductList")}
        </Link>
      </div>
    </div>
  );
}
