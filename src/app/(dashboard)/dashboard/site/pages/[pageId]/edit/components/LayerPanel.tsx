/**
 * LayerPanel — Photoshop-style nested layer tree for Editor V2.
 *
 * Reads from the zustand editor store; all mutations go through store
 * actions so undo/redo (zundo) captures them. Tier-1 UI:
 *  - Nested tree with expand/collapse for groups.
 *  - Click to select (Shift = additive multi-select).
 *  - Eye / lock icons toggle visibility & lock on the layer.
 *  - Double-click name to rename inline.
 *  - Drag a row onto another to reorder; drop on a group expands into it,
 *    drop on a leaf places as sibling immediately before.
 *  - Group / Ungroup / Delete via the toolbar at the top.
 *
 * The panel is intentionally **display-only** for type icons — leaf
 * layers paint via the existing DOM-first canvas; this tree is the
 * scene-level control surface (visibility, order, naming, grouping).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useEditorStore,
  selectRoot,
  selectSelectedId,
  selectMultiIds,
} from "../store/editor-store";
import type { GroupLayer, Layer, LayerId, LayerType } from "@/lib/scene";

/* ─── Type → display glyph ─── */

const TYPE_ICON: Record<LayerType, string> = {
  group: "📁",
  text: "T",
  image: "🖼",
  box: "▢",
  shape: "◇",
  board: "📋",
  product: "🛒",
  exhibition: "🎨",
  menu: "☰",
  login: "🔑",
  mail: "✉",
};

/* ─── Row ─── */

interface RowProps {
  layer: Layer;
  depth: number;
  selectedId: LayerId | null;
  multiIds: Set<LayerId>;
  expanded: Set<LayerId>;
  toggleExpanded: (id: LayerId) => void;
  onDropOn: (draggedId: LayerId, target: Layer) => void;
}

function Row({
  layer,
  depth,
  selectedId,
  multiIds,
  expanded,
  toggleExpanded,
  onDropOn,
}: RowProps) {
  const select = useEditorStore((s) => s.select);
  const toggleVisibility = useEditorStore((s) => s.toggleVisibility);
  const toggleLock = useEditorStore((s) => s.toggleLock);
  const rename = useEditorStore((s) => s.rename);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(layer.name);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isGroup = layer.type === "group";
  const isOpen = isGroup && expanded.has(layer.id);
  const isSelected = selectedId === layer.id || multiIds.has(layer.id);

  const commitRename = () => {
    setEditing(false);
    const next = draftName.trim();
    if (next && next !== layer.name) rename(layer.id, next);
    else setDraftName(layer.name);
  };

  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/layer-id", layer.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const draggedId = e.dataTransfer.getData("text/layer-id");
          if (draggedId && draggedId !== layer.id) onDropOn(draggedId, layer);
        }}
        onClick={(e) => {
          select(layer.id, { additive: e.shiftKey });
        }}
        className={[
          "layerpanel-row",
          isSelected ? "is-selected" : "",
          dragOver ? "is-drop-target" : "",
          !layer.visible ? "is-hidden" : "",
          layer.locked ? "is-locked" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 6 + depth * 14 }}
        data-layer-id={layer.id}
      >
        {isGroup ? (
          <button
            type="button"
            className="layerpanel-chev"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(layer.id);
            }}
            aria-label={isOpen ? "접기" : "펼치기"}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="layerpanel-chev-spacer" />
        )}

        <span className="layerpanel-icon" aria-hidden>
          {TYPE_ICON[layer.type] || "•"}
        </span>

        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            className="layerpanel-name-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") {
                setDraftName(layer.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="layerpanel-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraftName(layer.name);
              setEditing(true);
            }}
            title={layer.name}
          >
            {layer.name}
          </span>
        )}

        <button
          type="button"
          className="layerpanel-action"
          title={layer.visible ? "숨기기" : "표시"}
          onClick={(e) => {
            e.stopPropagation();
            toggleVisibility(layer.id);
          }}
        >
          {layer.visible ? "👁" : "⦸"}
        </button>
        <button
          type="button"
          className="layerpanel-action"
          title={layer.locked ? "잠금 해제" : "잠금"}
          onClick={(e) => {
            e.stopPropagation();
            toggleLock(layer.id);
          }}
        >
          {layer.locked ? "🔒" : "🔓"}
        </button>
      </div>

      {isGroup && isOpen
        ? (layer as GroupLayer).children
            // render top-of-stack first (Photoshop convention).
            .slice()
            .reverse()
            .map((child) => (
              <Row
                key={child.id}
                layer={child}
                depth={depth + 1}
                selectedId={selectedId}
                multiIds={multiIds}
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                onDropOn={onDropOn}
              />
            ))
        : null}
    </>
  );
}

/* ─── Panel ─── */

export function LayerPanel() {
  const root = useEditorStore(selectRoot);
  const selectedId = useEditorStore(selectSelectedId);
  const multiIds = useEditorStore(selectMultiIds);

  const moveLayer = useEditorStore((s) => s.moveLayer);
  const groupAction = useEditorStore((s) => s.group);
  const ungroupAction = useEditorStore((s) => s.ungroup);
  const removeAction = useEditorStore((s) => s.remove);

  // Initially expand only the root so the user sees the top level.
  const [expanded, setExpanded] = useState<Set<LayerId>>(
    () => new Set([root.id]),
  );
  const toggleExpanded = useCallback((id: LayerId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedIds = useMemo(() => {
    const s = new Set<LayerId>(multiIds);
    if (selectedId) s.add(selectedId);
    return Array.from(s);
  }, [selectedId, multiIds]);

  const onDropOn = useCallback(
    (draggedId: LayerId, target: Layer) => {
      if (target.type === "group") {
        // Drop into group: append at end (top of paint order).
        moveLayer(draggedId, target.id, (target as GroupLayer).children.length);
        // Auto-expand so the user sees where it landed.
        setExpanded((prev) => {
          if (prev.has(target.id)) return prev;
          const next = new Set(prev);
          next.add(target.id);
          return next;
        });
        return;
      }
      // Drop on a leaf: insert as a sibling just before the target in the
      // target's parent. Walk the tree to find the parent/index.
      const locate = (
        node: GroupLayer,
      ): { parent: GroupLayer; index: number } | null => {
        for (let i = 0; i < node.children.length; i++) {
          const c = node.children[i]!;
          if (c.id === target.id) return { parent: node, index: i };
          if (c.type === "group") {
            const found = locate(c);
            if (found) return found;
          }
        }
        return null;
      };
      const loc = locate(root);
      if (!loc) return;
      moveLayer(draggedId, loc.parent.id, loc.index);
    },
    [moveLayer, root],
  );

  const doGroup = () => {
    if (selectedIds.length < 2) return;
    groupAction(selectedIds);
  };
  const doUngroup = () => {
    if (!selectedId) return;
    ungroupAction(selectedId);
  };
  const doRemove = () => {
    for (const id of selectedIds) removeAction(id);
  };

  // Auto-scroll selected row into view when canvas selection changes.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-layer-id="${CSS.escape(selectedId)}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Also auto-expand ancestor groups so the row is visible.
    const path: LayerId[] = [];
    const locate = (node: GroupLayer, trail: LayerId[]): boolean => {
      for (const c of node.children) {
        if (c.id === selectedId) {
          path.push(...trail);
          return true;
        }
        if (c.type === "group" && locate(c, [...trail, c.id])) return true;
      }
      return false;
    };
    locate(root, []);
    if (path.length > 0) {
      setExpanded((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of path) if (!next.has(id)) { next.add(id); changed = true; }
        return changed ? next : prev;
      });
    }
  }, [selectedId, root]);

  return (
    <div className="layerpanel">
      <div className="layerpanel-toolbar">
        <span className="layerpanel-title">레이어</span>
        <div className="layerpanel-toolbar-actions">
          <button
            type="button"
            onClick={doGroup}
            disabled={selectedIds.length < 2}
            title="선택한 레이어를 그룹으로 묶기 (Ctrl+G)"
          >
            그룹
          </button>
          <button
            type="button"
            onClick={doUngroup}
            disabled={!selectedId}
            title="그룹 해제 (Ctrl+Shift+G)"
          >
            해제
          </button>
          <button
            type="button"
            onClick={doRemove}
            disabled={selectedIds.length === 0}
            title="선택 레이어 삭제 (Delete)"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="layerpanel-list" role="tree" ref={listRef}>
        {root.children.length === 0 ? (
          <div className="layerpanel-empty">레이어가 없습니다.</div>
        ) : (
          root.children
            .slice()
            .reverse()
            .map((child) => (
              <Row
                key={child.id}
                layer={child}
                depth={0}
                selectedId={selectedId}
                multiIds={multiIds}
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                onDropOn={onDropOn}
              />
            ))
        )}
      </div>
      <TransformInspector selectedId={selectedId} root={root} />
    </div>
  );
}

/* ─── Transform inspector ───
 * Shown at the bottom of the panel when exactly one layer is selected.
 * Tier-2 only exposes rotation — scale / origin come later via the
 * canvas transform handle gesture (Tier-3). */
function TransformInspector({
  selectedId,
  root,
}: {
  selectedId: LayerId | null;
  root: GroupLayer;
}) {
  const setTransform = useEditorStore((s) => s.setTransform);
  // Walk once per render to resolve the selected layer; panels typically
  // have 10s of layers so the cost is trivial.
  const layer = useMemo<Layer | null>(() => {
    if (!selectedId) return null;
    const walk = (g: GroupLayer): Layer | null => {
      for (const c of g.children) {
        if (c.id === selectedId) return c;
        if (c.type === "group") {
          const r = walk(c);
          if (r) return r;
        }
      }
      return null;
    };
    return walk(root);
  }, [selectedId, root]);

  if (!layer) return null;
  const rotate = layer.transform?.rotate ?? 0;

  return (
    <div className="layerpanel-inspector">
      <div className="layerpanel-inspector-row">
        <label htmlFor="layerpanel-rotate">회전</label>
        <input
          id="layerpanel-rotate"
          type="number"
          step="1"
          value={Math.round(rotate)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            setTransform(layer.id, { rotate: Number.isNaN(n) ? 0 : n });
          }}
        />
        <span className="layerpanel-inspector-unit">°</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={rotate}
          onChange={(e) => setTransform(layer.id, { rotate: parseFloat(e.target.value) })}
          className="layerpanel-inspector-slider"
        />
        <button
          type="button"
          className="layerpanel-inspector-reset"
          title="회전 초기화"
          onClick={() => setTransform(layer.id, { rotate: 0 })}
        >
          ↺
        </button>
      </div>
    </div>
  );
}

export default LayerPanel;
