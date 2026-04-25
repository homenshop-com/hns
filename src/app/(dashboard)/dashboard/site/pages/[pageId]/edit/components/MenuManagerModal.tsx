/**
 * MenuManagerModal — site-wide menu structure editor.
 *
 * Drives the Pages list that `buildMenuHtml()` reads from:
 *   - `showInMenu` toggle (visibility)
 *   - `menuTitle` (display label override)
 *   - `externalUrl` (link out instead of routing to a page slug)
 *   - drag reorder (sortOrder)
 *   - `parentId` for 2-depth submenus (set by indenting a row under another)
 *
 * UX is optimized for non-designer users — every action is one click,
 * inline buttons (no hidden menus), confirm dialogs only for destructive
 * ops. Persists each row via PATCH /api/sites/{siteId}/pages/{pageId}.
 */

"use client";

import { useEffect, useMemo, useState } from "react";

interface PageRow {
  id: string;
  title: string;
  slug: string;
  isHome: boolean;
  parentId?: string | null;
  showInMenu?: boolean;
  menuTitle?: string | null;
  externalUrl?: string | null;
}

interface Props {
  siteId: string;
  pages: PageRow[];
  onClose(): void;
  onPagesChanged(updated: PageRow[]): void;
}

const RESERVED_SLUGS = new Set(["user", "users", "agreement", "empty"]);

export default function MenuManagerModal({
  siteId,
  pages,
  onClose,
  onPagesChanged,
}: Props) {
  // Local working copy so the user can tweak everything, then save once.
  // Order = sortOrder; we don't expose a numeric field — just drag.
  const [rows, setRows] = useState<PageRow[]>(() =>
    [...pages].filter((p) => !RESERVED_SLUGS.has(p.slug)),
  );
  useEffect(() => {
    setRows([...pages].filter((p) => !RESERVED_SLUGS.has(p.slug)));
  }, [pages]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Build the visual tree: top-level + grouped children. Order within
  // each level mirrors `rows` order.
  const tree = useMemo(() => {
    const top = rows.filter((r) => !r.parentId);
    const childrenOf = (id: string) => rows.filter((r) => r.parentId === id);
    return top.map((p) => ({ page: p, children: childrenOf(p.id) }));
  }, [rows]);

  /* ── Drag-reorder ── */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const reorder = (fromId: string, toId: string, asChild: boolean) => {
    setRows((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((r) => r.id === fromId);
      const toIdx = next.findIndex((r) => r.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return prev;
      // Re-resolve target index after removal.
      const newToIdx = next.findIndex((r) => r.id === toId);
      // If `asChild`, the dropped row becomes a child of the target.
      if (asChild) moved.parentId = toId;
      else moved.parentId = next[newToIdx]?.parentId ?? null;
      // Place it just after target — visually feels right whether
      // dropping into a sibling slot or onto a parent.
      next.splice(newToIdx + 1, 0, moved);
      return next;
    });
  };

  /* ── Field updates ── */
  const update = (id: string, patch: Partial<PageRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const promote = (id: string) => {
    // Make a child a top-level row.
    update(id, { parentId: null });
  };

  /* ── Save: diff against original prop, PATCH each changed row ── */
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const original = new Map(pages.map((p) => [p.id, p]));
      // Reconstruct sortOrder from current rows array. Each row gets the
      // index it appears at in `rows`, so reordering propagates.
      const updates: Array<Promise<Response>> = [];
      rows.forEach((r, idx) => {
        const o = original.get(r.id);
        if (!o) return;
        const changed: Partial<PageRow> & { sortOrder?: number } = {};
        if ((o.showInMenu ?? true) !== (r.showInMenu ?? true)) {
          changed.showInMenu = r.showInMenu ?? true;
        }
        if ((o.menuTitle ?? "") !== (r.menuTitle ?? "")) {
          changed.menuTitle = r.menuTitle ?? "";
        }
        if ((o.externalUrl ?? "") !== (r.externalUrl ?? "")) {
          changed.externalUrl = r.externalUrl ?? "";
        }
        if ((o.parentId ?? null) !== (r.parentId ?? null)) {
          changed.parentId = r.parentId ?? null;
        }
        // Position changed if its index differs from original.
        const origIdx = pages.findIndex((p) => p.id === r.id);
        if (origIdx !== idx) {
          changed.sortOrder = idx;
        }
        if (Object.keys(changed).length === 0) return;
        updates.push(
          fetch(`/api/sites/${siteId}/pages/${r.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(changed),
          }),
        );
      });
      const results = await Promise.all(updates);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const j = (await failed.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `저장 실패 (${failed.status})`);
      }
      onPagesChanged(rows);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "85vh",
          background: "#1a1c24",
          color: "#e8eaf2",
          borderRadius: 10,
          border: "1px solid #2a2d3a",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #2a2d3a",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>메뉴 관리</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              모든 페이지의 메뉴 표시·이름·순서를 한 곳에서 편집. 변경은 모든 페이지의 헤더에 적용됩니다.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
          {tree.length === 0 && (
            <div style={{ color: "#888", padding: 12, textAlign: "center" }}>
              표시할 페이지가 없습니다.
            </div>
          )}
          {tree.map(({ page, children }) => (
            <div key={page.id} style={{ marginBottom: 6 }}>
              <PageRowItem
                row={page}
                isChild={false}
                isDragging={draggingId === page.id}
                isDropTarget={dragOverId === page.id}
                onDragStart={() => setDraggingId(page.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggingId && draggingId !== page.id) setDragOverId(page.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!draggingId || draggingId === page.id) return;
                  // Drop on a top-level row → keep at top-level, just reorder.
                  reorder(draggingId, page.id, false);
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onChange={(patch) => update(page.id, patch)}
                onPromote={() => {}}
              />
              {children.map((c) => (
                <div key={c.id} style={{ paddingLeft: 28, marginTop: 4 }}>
                  <PageRowItem
                    row={c}
                    isChild
                    isDragging={draggingId === c.id}
                    isDropTarget={dragOverId === c.id}
                    onDragStart={() => setDraggingId(c.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggingId && draggingId !== c.id) setDragOverId(c.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!draggingId || draggingId === c.id) return;
                      reorder(draggingId, c.id, false);
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onChange={(patch) => update(c.id, patch)}
                    onPromote={() => promote(c.id)}
                  />
                </div>
              ))}
              {/* Drop-as-child zone — drag a row here to make it a sub-menu */}
              {draggingId && draggingId !== page.id && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!draggingId || draggingId === page.id) return;
                    reorder(draggingId, page.id, true);
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  style={{
                    marginLeft: 28,
                    marginTop: 4,
                    padding: "6px 10px",
                    border: "1px dashed #4a90d9",
                    borderRadius: 4,
                    color: "#4a90d9",
                    fontSize: 11,
                    textAlign: "center",
                    cursor: "copy",
                  }}
                >
                  ↳ 여기로 드롭하면 "{page.menuTitle || page.title}"의 하위 메뉴가 됩니다
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #2a2d3a",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {err && (
            <span style={{ flex: 1, color: "#ff6b6b", fontSize: 11 }}>{err}</span>
          )}
          {!err && (
            <span style={{ flex: 1, color: "#666", fontSize: 11 }}>
              드래그로 순서 변경 · 점선 영역으로 드롭하면 하위 메뉴
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              background: "#2a2d3a",
              color: "#e8eaf2",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "8px 14px",
              background: "#2a79ff",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontSize: 12,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "저장 중…" : "변경 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PageRowItem({
  row,
  isChild,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onChange,
  onPromote,
}: {
  row: PageRow;
  isChild: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onChange: (patch: Partial<PageRow>) => void;
  onPromote: () => void;
}) {
  const visible = row.showInMenu !== false;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: isDropTarget ? "rgba(74,144,217,0.18)" : "#0f1117",
        border: isDropTarget
          ? "1px solid #4a90d9"
          : isChild
            ? "1px solid #1f2230"
            : "1px solid #2a2d3a",
        borderRadius: 6,
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
      }}
    >
      <i
        className="fa-solid fa-grip-vertical"
        style={{ color: "#666", fontSize: 11 }}
        aria-hidden
      />
      <span
        style={{
          width: 14,
          height: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: isChild ? "#666" : "#aaa",
          fontSize: 10,
        }}
      >
        {isChild ? "↳" : "•"}
      </span>

      <input
        type="text"
        value={row.menuTitle ?? ""}
        placeholder={row.title}
        onChange={(e) => onChange({ menuTitle: e.target.value })}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "5px 8px",
          background: "#1a1c24",
          color: "#e8eaf2",
          border: "1px solid #2a2d3a",
          borderRadius: 4,
          fontSize: 12,
        }}
        title="메뉴에 표시될 라벨 (비우면 페이지 제목 사용)"
      />

      <input
        type="text"
        value={row.externalUrl ?? ""}
        placeholder="외부 URL (선택)"
        onChange={(e) => onChange({ externalUrl: e.target.value })}
        style={{
          width: 130,
          padding: "5px 8px",
          background: "#1a1c24",
          color: "#e8eaf2",
          border: "1px solid #2a2d3a",
          borderRadius: 4,
          fontSize: 11,
        }}
        title="입력 시 새 창으로 이동 (페이지 라우트 대신)"
      />

      <button
        type="button"
        onClick={() => onChange({ showInMenu: !visible })}
        title={visible ? "메뉴에서 숨김" : "메뉴에 표시"}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          background: "transparent",
          color: visible ? "#3ccf97" : "#666",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        <i className={`fa-solid fa-${visible ? "eye" : "eye-slash"}`} />
      </button>

      {isChild && (
        <button
          type="button"
          onClick={onPromote}
          title="상위 메뉴로 올리기"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            background: "transparent",
            color: "#888",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          <i className="fa-solid fa-arrow-up-from-bracket" />
        </button>
      )}
    </div>
  );
}
