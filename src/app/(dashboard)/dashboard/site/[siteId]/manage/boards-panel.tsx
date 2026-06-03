"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export interface BoardItem {
  pgId: string;      // Prisma UUID — used for API calls
  legacyId: number;  // legacy numeric ID — used for post list URL
  name: string;
  lang: string;
  cnt: number;
}

interface BoardsPanelProps {
  siteId: string;
  totalPostCount: number;
  initialBoards: BoardItem[];
  labels: {
    boardManage: string;
    postManage: string;
  };
}

export default function BoardsPanel({
  siteId,
  totalPostCount: initialTotal,
  initialBoards,
  labels,
}: BoardsPanelProps) {
  const t = useTranslations("siteManage");
  const [boards, setBoards] = useState<BoardItem[]>(initialBoards);
  const [totalPostCount, setTotalPostCount] = useState(initialTotal);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, name: newName.trim(), lang: "ko" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("boardCreateFailed"));
      const b = data.board;
      setBoards((prev) => [
        ...prev,
        { pgId: b.id, legacyId: b.legacyId ?? 0, name: b.name, lang: b.lang, cnt: 0 },
      ]);
      setNewName("");
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("errorOccurred"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(board: BoardItem) {
    if (board.cnt > 0) {
      if (!confirm(t("confirmDeleteBoardWithPosts", { name: board.name, count: board.cnt }))) return;
    } else {
      if (!confirm(t("confirmDeleteBoard", { name: board.name }))) return;
    }
    setDeletingId(board.pgId);
    try {
      const res = await fetch(`/api/boards/${board.pgId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? t("deleteFailed"));
        return;
      }
      setBoards((prev) => prev.filter((b) => b.pgId !== board.pgId));
      setTotalPostCount((prev) => Math.max(0, prev - board.cnt));
    } finally {
      setDeletingId(null);
    }
  }

  const visibleBoards = boards.filter((b) => b.name && b.name !== "Default" && b.name !== "DefaultCategories");

  return (
    <div className="dv2-panel mv2-data-col">
      {/* Header ribbon */}
      <div className="mv2-hd-ribbon hd-green" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="ic">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </div>
          <h3 style={{ margin: 0 }}>{labels.boardManage}</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="meta">{t("boardsMeta", { boards: boards.length, posts: totalPostCount })}</span>
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setCreateError(null); }}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 700,
              background: showCreate ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {showCreate ? t("cancel") : t("newBoard")}
          </button>
        </div>
      </div>

      {/* Create form (inline, collapsible) */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--line-2)",
            background: "var(--panel-2, #f8fafc)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            required
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("newBoardNamePlaceholder")}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "7px 11px",
              fontSize: 13,
              border: "1.5px solid var(--line, #e2e8f0)",
              borderRadius: 7,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            style={{
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 600,
              background: creating ? "#9ca3af" : "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              cursor: creating ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {creating ? t("creating") : t("createBoard")}
          </button>
          {createError && (
            <div style={{ width: "100%", fontSize: 12, color: "#dc2626", marginTop: 2 }}>
              {createError}
            </div>
          )}
        </form>
      )}

      {/* Board list */}
      <div className="mv2-list">
        {/* All posts shortcut */}
        <Link href={`/dashboard/boards/posts?siteId=${siteId}`} className="mv2-list-item">
          <div className="li-title">
            <span className="n">{labels.postManage}</span>
            <span className="lang-chip">{t("all")}</span>
          </div>
          <div className="li-right">
            <span className="count">{totalPostCount}</span>
            <span>{t("unitPosts")}</span>
            <span className="chev">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </div>
        </Link>

        {visibleBoards.length === 0 && (
          <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--ink-3)", textAlign: "center" }}>
            {t("noBoards")}
          </div>
        )}

        {visibleBoards.map((b) => {
          const isInquiry = b.legacyId === 13;
          const isEmpty = b.cnt === 0;
          const isDeleting = deletingId === b.pgId;
          return (
            <div
              key={b.pgId}
              className={[
                "mv2-list-item",
                isInquiry && b.cnt > 0 ? "highlight" : "",
                isEmpty ? "empty" : "",
              ].filter(Boolean).join(" ")}
              style={{ display: "flex", alignItems: "center", padding: 0 }}
            >
              {/* Click area → posts */}
              <Link
                href={`/dashboard/boards/posts?category=${b.legacyId}&siteId=${siteId}`}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0 10px 16px",
                  textDecoration: "none",
                  color: "inherit",
                  minWidth: 0,
                }}
              >
                <div className="li-title" style={{ margin: 0 }}>
                  <span className="n">{b.name}</span>
                  {b.lang && <span className="lang-chip">{b.lang}</span>}
                </div>
                <div className="li-right" style={{ paddingRight: 4 }}>
                  <span className="count">{b.cnt}</span>
                  <span>{t("unitPosts")}</span>
                  <span className="chev">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </span>
                </div>
              </Link>
              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDelete(b)}
                disabled={isDeleting}
                title={t("deleteBoardTitle", { name: b.name })}
                style={{
                  padding: "6px 10px",
                  marginRight: 6,
                  flexShrink: 0,
                  fontSize: 11,
                  color: isDeleting ? "#9ca3af" : "#dc2626",
                  background: "transparent",
                  border: "none",
                  cursor: isDeleting ? "default" : "pointer",
                  opacity: 0.7,
                }}
              >
                {isDeleting ? "..." : t("delete")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
