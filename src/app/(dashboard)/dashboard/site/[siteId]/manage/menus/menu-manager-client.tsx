"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import LanguageSettings from "@/components/LanguageSettings";

const LANG_NAMES: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-cn": "中文(简)",
  "zh-tw": "中文(繁)",
  es: "Español",
};

interface PageItem {
  id: string;
  title: string;
  slug: string;
  lang: string;
  sortOrder: number;
  isHome: boolean;
  parentId: string | null;
  showInMenu: boolean;
  menuTitle: string | null;
  menuType: string;
  externalUrl: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogImage?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface Props {
  siteId: string;
  shopId: string;
  initialPages: PageItem[];
  userName: string;
  languages: string[];
  defaultLanguage: string;
}

interface DisplayItem extends PageItem {
  level: number;
}

export default function MenuManagerClient({
  siteId,
  shopId,
  initialPages,
  userName,
  languages: initialLanguages,
  defaultLanguage: initialDefault,
}: Props) {
  const [pages, setPages] = useState<PageItem[]>(initialPages);
  const [languages, setLanguages] = useState<string[]>(initialLanguages);
  const [defaultLanguage, setDefaultLanguage] = useState(initialDefault);
  const [activeLang, setActiveLang] = useState(initialDefault);
  const [saving, setSaving] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<"page" | "external">("page");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newParentId, setNewParentId] = useState<string>("");
  const [newExternalUrl, setNewExternalUrl] = useState("");

  // Edit modal
  const [showEditModal, setShowEditModal] = useState<PageItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editMenuTitle, setEditMenuTitle] = useState("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [editMenuType, setEditMenuType] = useState("page");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [editSeoTitle, setEditSeoTitle] = useState("");
  const [editSeoDesc, setEditSeoDesc] = useState("");
  const [editSeoKeywords, setEditSeoKeywords] = useState("");
  const [editOgImage, setEditOgImage] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Sync pages across languages
  const syncPages = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/sync-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pages) {
          setPages(data.pages);
        }
        return data.synced as number;
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
    return 0;
  }, [siteId]);

  // Auto-sync when switching language tabs
  const handleLangSwitch = useCallback(
    async (lang: string) => {
      setActiveLang(lang);
      const langPageCount = pages.filter((p) => p.lang === lang).length;
      const defaultPageCount = pages.filter((p) => p.lang === defaultLanguage).length;
      if (langPageCount < defaultPageCount && lang !== defaultLanguage) {
        const synced = await syncPages();
        if (synced && synced > 0) {
          showMsgFn(`${synced}개 페이지가 동기화되었습니다.`);
        }
      }
    },
    [pages, defaultLanguage, syncPages]
  );

  // Auto-sync on mount if non-default languages have fewer pages
  useEffect(() => {
    if (languages.length <= 1) return;
    const defaultCount = initialPages.filter((p) => p.lang === initialDefault).length;
    const needsSync = languages.some(
      (lang) =>
        lang !== initialDefault &&
        initialPages.filter((p) => p.lang === lang).length < defaultCount
    );
    if (needsSync) {
      syncPages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMsgFn = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  // Build tree display list for active lang
  const buildDisplayList = useCallback(
    (allPages: PageItem[]): DisplayItem[] => {
      const langPages = allPages.filter((p) => p.lang === activeLang);
      const parents = langPages
        .filter((p) => !p.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const result: DisplayItem[] = [];
      for (const parent of parents) {
        result.push({ ...parent, level: 0 });
        const children = langPages
          .filter((p) => p.parentId === parent.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        for (const child of children) {
          result.push({ ...child, level: 1 });
        }
      }
      return result;
    },
    [activeLang]
  );

  const displayList = buildDisplayList(pages);

  // Get top-level pages for parent dropdown
  const topLevelPages = pages
    .filter((p) => p.lang === activeLang && !p.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Drag and drop
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragNestIntent, setDragNestIntent] = useState(false);
  const dragStartXRef = useRef<number>(0);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    setDragIndex(index);
    dragStartXRef.current = e.clientX;
  };
  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
    setDragOverIndex(index);
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    // Detect rightward drag (>60px offset = nest intent)
    const dx = e.clientX - dragStartXRef.current;
    setDragNestIntent(dx > 60);
    if (dragOverItem.current !== index) {
      dragOverItem.current = index;
      setDragOverIndex(index);
    }
  };
  const handleDragEnd = () => {
    if (
      dragItem.current !== null &&
      dragOverItem.current !== null &&
      dragItem.current !== dragOverItem.current
    ) {
      const newDisplay = [...displayList];
      const removed = newDisplay.splice(dragItem.current, 1)[0];
      const targetIdx = dragOverItem.current > dragItem.current ? dragOverItem.current - 1 : dragOverItem.current;
      newDisplay.splice(dragOverItem.current, 0, removed);

      // Determine new parentId based on nest intent
      const dropTarget = displayList[dragOverItem.current];
      if (dragNestIntent && dropTarget) {
        // Find the nearest top-level item at or above the drop position
        let parentCandidate: DisplayItem | null = null;
        for (let i = dragOverItem.current; i >= 0; i--) {
          if (displayList[i].level === 0 && displayList[i].id !== removed.id) {
            parentCandidate = displayList[i];
            break;
          }
        }
        if (parentCandidate) {
          removed.parentId = parentCandidate.id;
          removed.level = 1;
        }
      } else {
        // If dragged to top level position (not nested)
        if (dropTarget && dropTarget.level === 0) {
          removed.parentId = null;
          removed.level = 0;
        }
        // If dropped among children, adopt same parent
        if (dropTarget && dropTarget.level === 1 && !dragNestIntent) {
          removed.parentId = dropTarget.parentId;
          removed.level = 1;
        }
      }

      // Update pages array with new sortOrder and parentId
      setPages((prev) => {
        const updated = [...prev];
        newDisplay.forEach((item, idx) => {
          const pi = updated.findIndex((p) => p.id === item.id);
          if (pi !== -1) {
            updated[pi] = { ...updated[pi], sortOrder: idx, parentId: item.parentId };
          }
        });
        return updated;
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
    setDragNestIntent(false);
  };

  // Move up/down within siblings
  const moveUp = useCallback(
    (displayIdx: number) => {
      const item = displayList[displayIdx];
      if (!item) return;
      // Find previous sibling with same parentId
      for (let i = displayIdx - 1; i >= 0; i--) {
        if (displayList[i].parentId === item.parentId) {
          setPages((prev) => {
            const updated = [...prev];
            const aIdx = updated.findIndex((p) => p.id === item.id);
            const bIdx = updated.findIndex((p) => p.id === displayList[i].id);
            if (aIdx !== -1 && bIdx !== -1) {
              const tmpOrder = updated[aIdx].sortOrder;
              updated[aIdx] = { ...updated[aIdx], sortOrder: updated[bIdx].sortOrder };
              updated[bIdx] = { ...updated[bIdx], sortOrder: tmpOrder };
            }
            return updated;
          });
          return;
        }
      }
    },
    [displayList]
  );

  const moveDown = useCallback(
    (displayIdx: number) => {
      const item = displayList[displayIdx];
      if (!item) return;
      for (let i = displayIdx + 1; i < displayList.length; i++) {
        if (displayList[i].parentId === item.parentId) {
          setPages((prev) => {
            const updated = [...prev];
            const aIdx = updated.findIndex((p) => p.id === item.id);
            const bIdx = updated.findIndex((p) => p.id === displayList[i].id);
            if (aIdx !== -1 && bIdx !== -1) {
              const tmpOrder = updated[aIdx].sortOrder;
              updated[aIdx] = { ...updated[aIdx], sortOrder: updated[bIdx].sortOrder };
              updated[bIdx] = { ...updated[bIdx], sortOrder: tmpOrder };
            }
            return updated;
          });
          return;
        }
      }
    },
    [displayList]
  );

  // Save sort order
  const handleSave = async () => {
    setSaving(true);
    try {
      const langPages = displayList.map((item, idx) => ({
        id: item.id,
        sortOrder: idx,
        parentId: item.parentId,
      }));
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, pages: langPages }),
      });
      if (res.ok) {
        showMsg("저장되었습니다.");
      } else {
        showMsg("저장 실패", "error");
      }
    } catch {
      showMsg("저장 실패", "error");
    }
    setSaving(false);
  };

  // Create page
  const handleCreate = async () => {
    if (!newTitle.trim()) {
      showMsg("제목을 입력하세요.", "error");
      return;
    }
    if (createType === "page" && !newSlug.trim()) {
      showMsg("파일명을 입력하세요.", "error");
      return;
    }
    if (createType === "external" && !newExternalUrl.trim()) {
      showMsg("URL을 입력하세요.", "error");
      return;
    }

    const slug =
      createType === "external"
        ? `ext-${Date.now()}`
        : newSlug.replace(/\.html$/, "").replace(/[^a-zA-Z0-9_-]/g, "");

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          title: newTitle.trim(),
          slug,
          lang: activeLang,
          parentId: newParentId || null,
          menuType: createType,
          externalUrl: createType === "external" ? newExternalUrl.trim() : null,
          showInMenu: true,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        resetCreateForm();
        // Sync to all languages after creating
        if (languages.length > 1) {
          await syncPages();
          showMsg(createType === "external" ? "외부 링크가 모든 언어에 추가되었습니다." : "페이지가 모든 언어에 생성되었습니다.");
        } else {
          const data = await res.json();
          setPages((prev) => [...prev, data.page]);
          showMsg(createType === "external" ? "외부 링크가 추가되었습니다." : "페이지가 생성되었습니다.");
        }
      } else {
        const err = await res.json();
        showMsg(
          err.error === "Slug already exists" ? "이미 존재하는 파일명입니다." : err.error || "생성 실패",
          "error"
        );
      }
    } catch {
      showMsg("생성 실패", "error");
    }
  };

  const resetCreateForm = () => {
    setNewTitle("");
    setNewSlug("");
    setNewParentId("");
    setNewExternalUrl("");
    setCreateType("page");
  };

  // Update page
  const handleUpdate = async () => {
    if (!showEditModal) return;
    if (!editTitle.trim()) {
      showMsg("제목을 입력하세요.", "error");
      return;
    }
    if (editMenuType === "page" && !editSlug.trim()) {
      showMsg("파일명을 입력하세요.", "error");
      return;
    }

    const slug = editSlug.replace(/\.html$/, "").replace(/[^a-zA-Z0-9_-]/g, "");
    try {
      const res = await fetch(`/api/pages/${showEditModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          slug: editMenuType === "page" ? slug : showEditModal.slug,
          menuTitle: editMenuTitle.trim() || null,
          parentId: editParentId || null,
          menuType: editMenuType,
          externalUrl: editMenuType === "external" ? editExternalUrl.trim() : null,
          seoTitle: editSeoTitle.trim() || null,
          seoDescription: editSeoDesc.trim() || null,
          seoKeywords: editSeoKeywords.trim() || null,
          ogImage: editOgImage.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPages((prev) =>
          prev.map((p) =>
            p.id === showEditModal.id
              ? {
                  ...p,
                  title: data.page.title,
                  slug: data.page.slug,
                  menuTitle: data.page.menuTitle,
                  parentId: data.page.parentId,
                  menuType: data.page.menuType,
                  externalUrl: data.page.externalUrl,
                  seoTitle: data.page.seoTitle,
                  seoDescription: data.page.seoDescription,
                  seoKeywords: data.page.seoKeywords,
                  ogImage: data.page.ogImage,
                }
              : p
          )
        );
        setShowEditModal(null);
        showMsg("수정되었습니다.");
      } else {
        const err = await res.json();
        showMsg(err.error === "Slug already exists" ? "이미 존재하는 파일명입니다." : "수정 실패", "error");
      }
    } catch {
      showMsg("수정 실패", "error");
    }
  };

  // Toggle showInMenu
  const toggleShowInMenu = async (page: PageItem) => {
    const newVal = !page.showInMenu;
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showInMenu: newVal }),
      });
      if (res.ok) {
        setPages((prev) =>
          prev.map((p) => (p.id === page.id ? { ...p, showInMenu: newVal } : p))
        );
        showMsg(newVal ? "메뉴에 표시됩니다." : "메뉴에서 숨겨집니다.");
      }
    } catch {
      showMsg("변경 실패", "error");
    }
  };

  // Delete page
  const handleDelete = async (pageId: string, isHome: boolean) => {
    if (isHome) {
      showMsg("홈 페이지는 삭제할 수 없습니다.", "error");
      return;
    }
    if (!confirm("이 페이지를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      if (res.ok) {
        setPages((prev) => {
          // Promote children to top-level
          const deleted = prev.find((p) => p.id === pageId);
          return prev
            .filter((p) => p.id !== pageId)
            .map((p) => (p.parentId === pageId ? { ...p, parentId: null } : p));
        });
        showMsg("삭제되었습니다.");
      } else {
        showMsg("삭제 실패", "error");
      }
    } catch {
      showMsg("삭제 실패", "error");
    }
  };

  const openEdit = (page: PageItem) => {
    setEditTitle(page.title);
    setEditSlug(page.slug);
    setEditMenuTitle(page.menuTitle || "");
    setEditParentId(page.parentId || "");
    setEditMenuType(page.menuType || "page");
    setEditExternalUrl(page.externalUrl || "");
    setEditSeoTitle(page.seoTitle || "");
    setEditSeoDesc(page.seoDescription || "");
    setEditSeoKeywords(page.seoKeywords || "");
    setEditOgImage(page.ogImage || "");
    setShowEditModal(page);
  };

  const formatOrder = (n: number) => String(n).padStart(2, "0");

  // Styles
  const btnPrimary: React.CSSProperties = {
    padding: "10px 24px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
  const btnOutline: React.CSSProperties = {
    padding: "10px 20px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 6,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f8", fontFamily: "Noto Sans KR, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#6b7280" }}>
            <Link href="/dashboard" style={{ fontSize: 20, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
              HomeNShop
            </Link>
            <span style={{ margin: "0 4px" }}>&gt;&gt;</span>
            <Link href={`/dashboard/site/${siteId}/manage`} style={{ color: "#2563eb", textDecoration: "none" }}>
              관리자모드
            </Link>
            <span style={{ margin: "0 4px" }}>&gt;&gt;</span>
            <span style={{ color: "#111827", fontWeight: 500 }}>메뉴관리</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#374151" }}>{userName}</span>
            <Link
              href={`/dashboard/site/settings`}
              style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 4 }}
            >
              사이트 설정
            </Link>
            <Link
              href="/dashboard"
              style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 4 }}
            >
              대시보드
            </Link>
          </div>
        </div>
      </header>

      {/* Toast */}
      {message && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            padding: "12px 24px",
            borderRadius: 8,
            background: message.type === "success" ? "#059669" : "#dc2626",
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {message.text}
        </div>
      )}

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
        {/* Language Settings */}
        {languages.length > 0 && (
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: "16px 24px",
              marginBottom: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              사이트 언어 설정
            </div>
            <LanguageSettings
              siteId={siteId}
              languages={languages}
              defaultLanguage={defaultLanguage}
              variant="compact"
              onUpdate={async (newLangs, newDefault) => {
                setLanguages(newLangs);
                setDefaultLanguage(newDefault);
                if (!newLangs.includes(activeLang)) {
                  setActiveLang(newDefault);
                }
                // Sync pages for newly added languages
                if (newLangs.length > languages.length) {
                  const synced = await syncPages();
                  if (synced && synced > 0) {
                    showMsg(`${synced}개 페이지가 새 언어에 동기화되었습니다.`);
                  }
                }
              }}
            />
          </div>
        )}

        {/* Language Tabs */}
        {languages.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 16,
              background: "#fff",
              borderRadius: 8,
              padding: "8px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => handleLangSwitch(lang)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 6,
                  border: "none",
                  background: activeLang === lang ? "#2563eb" : "transparent",
                  color: activeLang === lang ? "#fff" : "#6b7280",
                  fontSize: 14,
                  fontWeight: activeLang === lang ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {LANG_NAMES[lang] || lang}
                <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.8 }}>
                  ({pages.filter((p) => p.lang === lang).length})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Title bar */}
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: "20px 24px",
            marginBottom: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" }}>
            메뉴관리
            {languages.length > 1 && (
              <span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280", marginLeft: 12 }}>
                [{LANG_NAMES[activeLang] || activeLang}]
              </span>
            )}
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                resetCreateForm();
                setCreateType("page");
                setShowCreateModal(true);
              }}
              style={btnOutline}
            >
              + 페이지 추가
            </button>
            <button
              onClick={() => {
                resetCreateForm();
                setCreateType("external");
                setShowCreateModal(true);
              }}
              style={{ ...btnOutline, color: "#7c3aed", borderColor: "#c4b5fd" }}
            >
              + 외부 링크
            </button>
            <Link
              href={`/dashboard/site/pages/${displayList[0]?.id || ""}/edit`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                ...btnPrimary,
                textDecoration: "none",
              }}
            >
              디자인 관리
            </Link>
          </div>
        </div>

        {/* Page List */}
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {/* Top action bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 24px",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            <span>
              {syncing ? "동기화 중..." : `${displayList.length}개 항목`}
            </span>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 24px",
                background: saving ? "#9ca3af" : "#374151",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "저장 중..." : "순서 저장"}
            </button>
          </div>

          {/* Items */}
          <div style={{ padding: "0 24px" }}>
            {displayList.map((page, index) => {
              const isDropTarget = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
              return (
              <div
                key={page.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 0",
                  paddingLeft: page.level * 32,
                  borderBottom: index < displayList.length - 1 ? "1px solid #f3f4f6" : "none",
                  opacity: dragIndex === index ? 0.4 : page.showInMenu ? 1 : 0.5,
                  borderTop: isDropTarget ? `2px solid ${dragNestIntent ? "#7c3aed" : "#2563eb"}` : "none",
                  borderLeft: isDropTarget && dragNestIntent ? "3px solid #7c3aed" : "none",
                  marginLeft: isDropTarget && dragNestIntent ? 29 : 0,
                  transition: "opacity 0.2s",
                  cursor: "grab",
                  background: page.level > 0 ? "#fafbfc" : isDropTarget && dragNestIntent ? "#f5f3ff" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  {/* Drag handle + arrows */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ cursor: "grab", color: "#9ca3af", fontSize: 16, userSelect: "none" }} title="드래그">
                      ☰
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <button
                        onClick={() => moveUp(index)}
                        style={{
                          width: 22,
                          height: 16,
                          border: "1px solid #d1d5db",
                          borderRadius: 2,
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 9,
                          color: "#6b7280",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveDown(index)}
                        style={{
                          width: 22,
                          height: 16,
                          border: "1px solid #d1d5db",
                          borderRadius: 2,
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 9,
                          color: "#6b7280",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Level indicator */}
                  {page.level > 0 && (
                    <span style={{ color: "#d1d5db", fontSize: 14 }}>└</span>
                  )}

                  {/* Order number */}
                  <span style={{ color: "#9ca3af", fontSize: 13, minWidth: 36 }}>
                    [{formatOrder(index)}]
                  </span>

                  {/* Title */}
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: page.showInMenu ? "#111827" : "#9ca3af",
                      textTransform: "uppercase",
                      textDecoration: page.showInMenu ? "none" : "line-through",
                    }}
                  >
                    {page.menuTitle || page.title}
                  </span>

                  {/* Slug */}
                  {page.menuType !== "external" && (
                    <span style={{ color: "#6b7280", fontSize: 13 }}>
                      - {page.slug}.html
                    </span>
                  )}

                  {/* Badges */}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {page.isHome && (
                      <span style={{ fontSize: 11, background: "#dbeafe", color: "#2563eb", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                        HOME
                      </span>
                    )}
                    {page.menuType === "external" && (
                      <span style={{ fontSize: 11, background: "#ede9fe", color: "#7c3aed", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                        외부링크
                      </span>
                    )}
                    {!page.showInMenu && (
                      <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                        숨김
                      </span>
                    )}
                    {page.parentId && (
                      <span style={{ fontSize: 11, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 4 }}>
                        하위
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {/* Show/hide toggle */}
                  <button
                    onClick={() => toggleShowInMenu(page)}
                    title={page.showInMenu ? "메뉴에서 숨기기" : "메뉴에 표시하기"}
                    style={{
                      width: 32,
                      height: 32,
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      background: page.showInMenu ? "#fff" : "#f3f4f6",
                      cursor: "pointer",
                      fontSize: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {page.showInMenu ? "👁" : "👁‍🗨"}
                  </button>

                  {page.menuType !== "external" && (
                    <Link
                      href={`/dashboard/site/pages/${page.id}/edit`}
                      style={{
                        padding: "7px 14px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 500,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      디자인
                    </Link>
                  )}
                  <button
                    onClick={() => openEdit(page)}
                    style={{
                      padding: "7px 14px",
                      background: "#fff",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    수정
                  </button>
                  {!page.isHome && (
                    <button
                      onClick={() => handleDelete(page.id, page.isHome)}
                      style={{
                        padding: "7px 12px",
                        background: "#fff",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            );
            })}

            {displayList.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                {activeLang} 언어의 페이지가 없습니다. &quot;페이지 추가&quot; 버튼으로 첫 페이지를 만들어 보세요.
              </div>
            )}
          </div>

          {/* Bottom buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "16px 24px",
              gap: 8,
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <button
              onClick={() => {
                resetCreateForm();
                setCreateType("page");
                setShowCreateModal(true);
              }}
              style={btnPrimary}
            >
              페이지 생성
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...btnPrimary,
                background: saving ? "#9ca3af" : "#374151",
              }}
            >
              {saving ? "저장 중..." : "순서 저장"}
            </button>
          </div>
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998 }}
          onClick={() => setShowCreateModal(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 32, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#111827" }}>
              {createType === "external" ? "외부 링크 추가" : "새 페이지 생성"}
            </h2>

            {/* Type toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setCreateType("page")}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: `2px solid ${createType === "page" ? "#2563eb" : "#d1d5db"}`,
                  borderRadius: 8,
                  background: createType === "page" ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: createType === "page" ? 600 : 400,
                  color: createType === "page" ? "#2563eb" : "#6b7280",
                }}
              >
                페이지
              </button>
              <button
                onClick={() => setCreateType("external")}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: `2px solid ${createType === "external" ? "#7c3aed" : "#d1d5db"}`,
                  borderRadius: 8,
                  background: createType === "external" ? "#f5f3ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: createType === "external" ? 600 : 400,
                  color: createType === "external" ? "#7c3aed" : "#6b7280",
                }}
              >
                외부 링크
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                {createType === "external" ? "링크 제목 (메뉴명)" : "페이지 제목 (메뉴명)"}
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={createType === "external" ? "예: 블로그" : "예: ABOUTUS"}
                style={inputStyle}
              />
            </div>

            {createType === "page" ? (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>파일명 (slug)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="예: aboutus"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ color: "#6b7280", fontSize: 14 }}>.html</span>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>URL</label>
                <input
                  type="url"
                  value={newExternalUrl}
                  onChange={(e) => setNewExternalUrl(e.target.value)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>
            )}

            {/* Parent selection */}
            {topLevelPages.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>상위 메뉴 (선택사항)</label>
                <select
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">최상위 메뉴</option>
                  {topLevelPages.map((p) => (
                    <option key={p.id} value={p.id}>
                      └ {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowCreateModal(false)} style={btnOutline}>
                취소
              </button>
              <button onClick={handleCreate} style={btnPrimary}>
                {createType === "external" ? "추가" : "생성"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998 }}
          onClick={() => setShowEditModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 32, width: 480, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#111827" }}>
              상세정보 수정
            </h2>

            {/* Menu type toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setEditMenuType("page")}
                style={{
                  flex: 1,
                  padding: "8px",
                  border: `2px solid ${editMenuType === "page" ? "#2563eb" : "#d1d5db"}`,
                  borderRadius: 8,
                  background: editMenuType === "page" ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: editMenuType === "page" ? 600 : 400,
                  color: editMenuType === "page" ? "#2563eb" : "#6b7280",
                }}
              >
                페이지
              </button>
              <button
                onClick={() => setEditMenuType("external")}
                style={{
                  flex: 1,
                  padding: "8px",
                  border: `2px solid ${editMenuType === "external" ? "#7c3aed" : "#d1d5db"}`,
                  borderRadius: 8,
                  background: editMenuType === "external" ? "#f5f3ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: editMenuType === "external" ? 600 : 400,
                  color: editMenuType === "external" ? "#7c3aed" : "#6b7280",
                }}
              >
                외부 링크
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>페이지 제목</label>
              <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>메뉴 표시명 (비워두면 제목 사용)</label>
              <input
                type="text"
                value={editMenuTitle}
                onChange={(e) => setEditMenuTitle(e.target.value)}
                placeholder="메뉴에 다른 이름으로 표시"
                style={inputStyle}
              />
            </div>

            {editMenuType === "page" ? (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>파일명 (slug)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="text"
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ color: "#6b7280", fontSize: 14 }}>.html</span>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>URL</label>
                <input
                  type="url"
                  value={editExternalUrl}
                  onChange={(e) => setEditExternalUrl(e.target.value)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>
            )}

            {/* Parent selection (exclude self and own children) */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>상위 메뉴</label>
              <select
                value={editParentId}
                onChange={(e) => setEditParentId(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">최상위 메뉴</option>
                {topLevelPages
                  .filter((p) => p.id !== showEditModal.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      └ {p.title}
                    </option>
                  ))}
              </select>
            </div>

            {/* SEO Fields */}
            {editMenuType === "page" && (
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 12 }}>SEO 설정</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>SEO 제목</label>
                  <input type="text" value={editSeoTitle} onChange={(e) => setEditSeoTitle(e.target.value)} placeholder="검색결과에 표시될 제목" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>SEO 설명</label>
                  <textarea
                    value={editSeoDesc}
                    onChange={(e) => setEditSeoDesc(e.target.value)}
                    placeholder="검색결과에 표시될 설명"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" as const }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>SEO 키워드</label>
                  <input type="text" value={editSeoKeywords} onChange={(e) => setEditSeoKeywords(e.target.value)} placeholder="키워드1, 키워드2" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>OG 이미지 URL</label>
                  <input type="text" value={editOgImage} onChange={(e) => setEditOgImage(e.target.value)} placeholder="https://..." style={inputStyle} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowEditModal(null)} style={btnOutline}>
                취소
              </button>
              <button onClick={handleUpdate} style={btnPrimary}>
                수정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
