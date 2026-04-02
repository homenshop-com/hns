"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ─── */
interface PageItem {
  id: string;
  title: string;
  slug: string;
  lang: string;
  isHome: boolean;
  sortOrder: number;
  parentId: string | null;
  showInMenu: boolean;
  menuTitle: string | null;
  externalUrl: string | null;
}

interface Props {
  siteId: string;
  pages: PageItem[];
  languages: string[];
  defaultLanguage: string;
}

interface EditingState {
  id: string;
  menuTitle: string;
  showInMenu: boolean;
  parentId: string | null;
  externalUrl: string;
  isExternal: boolean;
}

const langNames: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-cn": "中文",
  es: "Español",
};

/* ─── Component ─── */
export default function MenuManager({
  siteId,
  pages: initialPages,
  languages,
  defaultLanguage,
}: Props) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [selectedLang, setSelectedLang] = useState(defaultLanguage);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<"top" | "bottom" | "child" | null>(null);

  // 새 항목 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<"external">("external");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const langPages = pages.filter((p) => p.lang === selectedLang);

  // 트리 구조로 변환
  const topLevel = langPages
    .filter((p) => !p.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const getChildren = useCallback(
    (parentId: string) =>
      langPages
        .filter((p) => p.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [langPages]
  );

  // 상위 메뉴 후보 (parentId가 null인 것만)
  const parentCandidates = langPages.filter(
    (p) => !p.parentId && (!editing || p.id !== editing.id)
  );

  /* ─── 편집 시작 ─── */
  function startEditing(page: PageItem) {
    setEditing({
      id: page.id,
      menuTitle: page.menuTitle || "",
      showInMenu: page.showInMenu,
      parentId: page.parentId,
      externalUrl: page.externalUrl || "",
      isExternal: !!page.externalUrl,
    });
  }

  /* ─── 편집 저장 ─── */
  async function saveEditing() {
    if (!editing) return;
    setSaving(true);

    const res = await fetch(`/api/sites/${siteId}/pages/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        showInMenu: editing.showInMenu,
        menuTitle: editing.menuTitle || null,
        parentId: editing.parentId,
        externalUrl: editing.isExternal ? editing.externalUrl || null : null,
      }),
    });

    setSaving(false);

    if (res.ok) {
      const updated = await res.json();
      setPages((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      setEditing(null);
    } else {
      const data = await res.json();
      alert(data.error || "저장에 실패했습니다.");
    }
  }

  /* ─── 숨김 토글 (인라인) ─── */
  async function toggleVisibility(page: PageItem) {
    const res = await fetch(`/api/sites/${siteId}/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInMenu: !page.showInMenu }),
    });

    if (res.ok) {
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, showInMenu: !p.showInMenu } : p
        )
      );
    }
  }

  /* ─── 드래그앤드롭 ─── */
  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, targetId: string, isChild: boolean) {
    e.preventDefault();
    if (dragId === targetId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // 상위 아이템 위에서: 상단 25% = 위에 삽입, 하단 25% = 아래 삽입, 중간 50% = 자식으로
    // 하위 아이템 위에서: 상단 50% = 위에 삽입, 하단 50% = 아래 삽입
    if (isChild) {
      setDragOverZone(y < height / 2 ? "top" : "bottom");
    } else {
      if (y < height * 0.25) {
        setDragOverZone("top");
      } else if (y > height * 0.75) {
        setDragOverZone("bottom");
      } else {
        setDragOverZone("child");
      }
    }
    setDragOverId(targetId);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
    setDragOverZone(null);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!dragId || !dragOverId || dragId === dragOverId || !dragOverZone) {
      handleDragEnd();
      return;
    }

    const dragPage = langPages.find((p) => p.id === dragId);
    const targetPage = langPages.find((p) => p.id === dragOverId);
    if (!dragPage || !targetPage) {
      handleDragEnd();
      return;
    }

    // 드래그한 항목이 부모인데 자식으로 넣으려고 하면 무시
    const dragChildren = getChildren(dragId);
    if (dragOverZone === "child" && targetPage.parentId) {
      // 이미 child인 target에 child로 넣으면 3depth → 불가
      handleDragEnd();
      return;
    }

    // 새 순서 계산
    const newItems: { id: string; sortOrder: number; parentId: string | null }[] = [];

    if (dragOverZone === "child") {
      // target의 자식으로 삽입
      const siblings = getChildren(dragOverId);
      // 드래그 항목을 target의 자식으로 (마지막)
      newItems.push({ id: dragId, sortOrder: siblings.length, parentId: dragOverId });
      // 드래그 항목의 기존 자식들도 상위로 올림
      dragChildren.forEach((c, i) => {
        newItems.push({ id: c.id, sortOrder: topLevel.length + i, parentId: null });
      });
    } else {
      // top 또는 bottom: 같은 레벨에서 순서 변경
      const targetParentId = targetPage.parentId;
      const siblings = targetParentId
        ? getChildren(targetParentId)
        : topLevel;

      const filtered = siblings.filter((p) => p.id !== dragId);
      const targetIndex = filtered.findIndex((p) => p.id === dragOverId);
      const insertIndex = dragOverZone === "top" ? targetIndex : targetIndex + 1;

      filtered.splice(insertIndex, 0, dragPage);
      filtered.forEach((p, i) => {
        newItems.push({ id: p.id, sortOrder: i, parentId: targetParentId });
      });

      // 드래그 항목의 parentId도 변경
      const existing = newItems.find((n) => n.id === dragId);
      if (existing) {
        existing.parentId = targetParentId;
      }
    }

    if (newItems.length === 0) {
      handleDragEnd();
      return;
    }

    // 로컬 상태 즉시 반영
    setPages((prev) => {
      const updated = [...prev];
      for (const item of newItems) {
        const idx = updated.findIndex((p) => p.id === item.id);
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            sortOrder: item.sortOrder,
            parentId: item.parentId,
          };
        }
      }
      return updated;
    });

    handleDragEnd();

    // 서버에 저장
    await fetch(`/api/sites/${siteId}/pages/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: newItems }),
    });
  }

  /* ─── 외부 링크 추가 ─── */
  async function handleAddExternal() {
    if (!newTitle.trim()) return;
    if (!newUrl.trim()) return;

    setAdding(true);

    const res = await fetch(`/api/sites/${siteId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        lang: selectedLang,
        externalUrl: newUrl,
        parentId: newParentId,
        showInMenu: true,
      }),
    });

    setAdding(false);

    if (res.ok) {
      setShowAddModal(false);
      setNewTitle("");
      setNewUrl("");
      setNewParentId(null);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "추가에 실패했습니다.");
    }
  }

  /* ─── 메뉴 아이템 행 렌더링 ─── */
  function renderRow(page: PageItem, isChild: boolean) {
    const isEditing = editing?.id === page.id;
    const isDragging = dragId === page.id;
    const isDropTarget = dragOverId === page.id;
    const label = page.menuTitle || page.title;

    return (
      <div
        key={page.id}
        draggable
        onDragStart={(e) => handleDragStart(e, page.id)}
        onDragOver={(e) => handleDragOver(e, page.id, isChild)}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={`
          flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800
          ${isChild ? "pl-12" : ""}
          ${isDragging ? "opacity-30" : ""}
          ${isDropTarget && dragOverZone === "top" ? "border-t-2 border-t-blue-500" : ""}
          ${isDropTarget && dragOverZone === "bottom" ? "border-b-2 border-b-blue-500" : ""}
          ${isDropTarget && dragOverZone === "child" ? "bg-blue-50 dark:bg-blue-950" : ""}
          transition-colors
        `}
      >
        {/* 드래그 핸들 */}
        <span className="cursor-grab text-zinc-400 select-none" title="드래그하여 순서 변경">
          ⠿
        </span>

        {/* 제목 + 슬러그 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${!page.showInMenu ? "text-zinc-400 line-through" : ""}`}>
              {label}
            </span>
            {page.isHome && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                홈
              </span>
            )}
            {page.externalUrl && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                외부링크
              </span>
            )}
            {isChild && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                하위
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-400 truncate">
            {page.externalUrl || `/${page.slug}`}
          </div>
        </div>

        {/* 숨김 토글 */}
        <button
          onClick={() => toggleVisibility(page)}
          className={`text-lg ${page.showInMenu ? "text-zinc-600" : "text-zinc-300"} hover:text-zinc-900 dark:hover:text-zinc-100`}
          title={page.showInMenu ? "메뉴에 표시 중 (클릭하여 숨김)" : "메뉴에서 숨김 (클릭하여 표시)"}
        >
          {page.showInMenu ? "👁" : "👁‍🗨"}
        </button>

        {/* 편집 버튼 */}
        <button
          onClick={() => (isEditing ? setEditing(null) : startEditing(page))}
          className={`rounded px-3 py-1 text-xs font-medium border ${
            isEditing
              ? "bg-blue-600 text-white border-blue-600"
              : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {isEditing ? "닫기" : "설정"}
        </button>
      </div>
    );
  }

  /* ─── 편집 패널 ─── */
  function renderEditPanel() {
    if (!editing) return null;
    const page = langPages.find((p) => p.id === editing.id);
    if (!page) return null;

    return (
      <div className="border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 rounded-lg p-5 mb-6">
        <h3 className="text-sm font-bold mb-4">
          &quot;{page.title}&quot; 메뉴 설정
        </h3>

        <div className="space-y-4">
          {/* 메뉴 표시명 */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              메뉴 표시명 (비우면 페이지 제목 사용)
            </label>
            <input
              type="text"
              value={editing.menuTitle}
              onChange={(e) => setEditing({ ...editing, menuTitle: e.target.value })}
              placeholder={page.title}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          {/* 메뉴 노출 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showInMenu"
              checked={editing.showInMenu}
              onChange={(e) => setEditing({ ...editing, showInMenu: e.target.checked })}
            />
            <label htmlFor="showInMenu" className="text-sm">
              메뉴에 표시
            </label>
          </div>

          {/* 상위 메뉴 선택 */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              상위 메뉴 (없으면 최상위)
            </label>
            <select
              value={editing.parentId || ""}
              onChange={(e) =>
                setEditing({ ...editing, parentId: e.target.value || null })
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">없음 (최상위)</option>
              {parentCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.menuTitle || p.title}
                </option>
              ))}
            </select>
          </div>

          {/* 외부 링크 */}
          {page.externalUrl !== null && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                외부 링크 URL
              </label>
              <input
                type="url"
                value={editing.externalUrl}
                onChange={(e) =>
                  setEditing({ ...editing, externalUrl: e.target.value })
                }
                placeholder="https://"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          )}

          {/* 저장 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={saveEditing}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── 렌더 ─── */
  return (
    <div>
      {/* 언어 탭 */}
      {languages.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => {
                setSelectedLang(lang);
                setEditing(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium border ${
                selectedLang === lang
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
              }`}
            >
              {langNames[lang] || lang}
            </button>
          ))}
        </div>
      )}

      {/* 안내 */}
      <p className="text-xs text-zinc-400 mb-4">
        드래그하여 순서 변경. 항목 위 가운데로 드래그하면 하위 메뉴로 설정됩니다. (최대 2단계)
      </p>

      {/* 편집 패널 */}
      {renderEditPanel()}

      {/* 메뉴 트리 */}
      {langPages.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">
            {langNames[selectedLang] || selectedLang} 페이지가 없습니다.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-xs font-medium text-zinc-500 uppercase">
              메뉴 구조 ({langNames[selectedLang] || selectedLang})
            </span>
            <span className="text-xs text-zinc-400">
              {langPages.filter((p) => p.showInMenu).length}개 표시 / {langPages.length}개 전체
            </span>
          </div>

          {/* 트리 목록 */}
          {topLevel.map((page) => (
            <div key={page.id}>
              {renderRow(page, false)}
              {getChildren(page.id).map((child) => renderRow(child, true))}
            </div>
          ))}
        </div>
      )}

      {/* 외부 링크 추가 버튼 */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg border border-dashed border-zinc-400 px-4 py-2 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-400"
        >
          + 외부 링크 추가
        </button>
      </div>

      {/* 외부 링크 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="text-lg font-bold mb-4">외부 링크 추가</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  메뉴 표시명
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 블로그"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  상위 메뉴
                </label>
                <select
                  value={newParentId || ""}
                  onChange={(e) => setNewParentId(e.target.value || null)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="">없음 (최상위)</option>
                  {parentCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.menuTitle || p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleAddExternal}
                disabled={adding || !newTitle.trim() || !newUrl.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {adding ? "추가 중..." : "추가"}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewTitle("");
                  setNewUrl("");
                  setNewParentId(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
