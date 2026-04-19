/**
 * Editor V2 store (Tier-1).
 *
 * Zustand + Immer + zundo. Holds the current SceneGraph plus selection,
 * hover, and UI toggles. `temporal` middleware provides undo/redo with
 * history capped at 50 entries — drag/resize/typing emit one commit per
 * user-gesture (mouseup / blur / apply), not per intermediate frame.
 *
 * The store is **mirrored** to the existing DOM-first editor surface:
 * the live `.dragable` DOM is still the visual truth; the store is the
 * authoritative scene data used by the LayerPanel and persisted on
 * save. `syncFromDom()` pulls the current DOM into the store (called
 * after drag/resize), and `syncToDom()` writes scene-level changes
 * (visibility, lock, reorder, rename) back to the DOM.
 *
 * This bidirectional design lets us layer V2 on top of V1 without
 * rewriting the canvas renderer — V2's unique capabilities (panel tree,
 * group nesting, per-layer visibility/lock) flow through the store;
 * V1's capabilities (drag, resize, TipTap) remain DOM-driven.
 */

"use client";

import { create } from "zustand";
import { temporal } from "zundo";
import { produce } from "immer";
import { hasTypedChildren, isSection, legacyHtmlToScene, sceneToLegacyHtml } from "@/lib/scene";
import type {
  GroupLayer,
  Layer,
  LayerId,
  LayerTransform,
  SceneGraph,
  SectionLayer,
} from "@/lib/scene";

/** A Layer that owns a `children: Layer[]` array — groups (incl. the
 *  virtual root) and sections (since Sprint 9c). */
type Container = GroupLayer | SectionLayer;

/* ─── State shape ─── */

export interface EditorState {
  scene: SceneGraph;
  /** Primary selection. Null when nothing selected. */
  selectedId: LayerId | null;
  /** Additional ids in a multi-selection (excludes `selectedId`). */
  multiSelectedIds: Set<LayerId>;
  /** Dirty flag — set by any mutation, cleared after successful save. */
  dirty: boolean;
}

export interface EditorActions {
  /** Replace the entire scene (used by initial load, AI edit, undo-all). */
  setScene(scene: SceneGraph): void;
  /** Import HTML into the scene in one shot. */
  importHtml(html: string): void;
  /** Export the current scene as legacy body HTML. */
  exportHtml(): string;

  /** Selection helpers. */
  select(id: LayerId | null, opts?: { additive?: boolean }): void;
  clearSelection(): void;

  /** Per-layer metadata toggles. */
  toggleVisibility(id: LayerId): void;
  toggleLock(id: LayerId): void;
  rename(id: LayerId, name: string): void;

  /** Delete a layer from its parent. No-op if not found. */
  remove(id: LayerId): void;

  /** Reorder within a parent. Pass `fromParentId === toParentId` to move
   *  within the same group; pass a different parent to re-home. */
  moveLayer(fromId: LayerId, toParentId: LayerId, toIndex: number): void;

  /** Group / ungroup. `group` wraps the given ids under a new GroupLayer;
   *  `ungroup` inlines the group's children into its parent. */
  group(ids: LayerId[], groupName?: string): LayerId | null;
  ungroup(groupId: LayerId): void;

  /** Merge a transform patch into a layer. Pass `null` to clear. */
  setTransform(id: LayerId, patch: Partial<LayerTransform> | null): void;

  /** Align multiple layers along an axis. Mutates each layer's frame.x/y
   *  and augments `frameKeys` so the serializer emits `left`/`top`. */
  alignLayers(ids: LayerId[], mode: AlignMode): void;

  /** Partial frame patch (for drag-move / resize). Augments frameKeys so
   *  the changed coords get serialized. */
  setFrame(id: LayerId, patch: Partial<{ x: number; y: number; w: number; h: number }>): void;

  /** Promote a BoxLayer's `.dragable` inner children into first-class
   *  layers, replacing the BoxLayer with a GroupLayer. Returns the new
   *  group id, or null if nothing to explode. */
  explodeBox(id: LayerId): LayerId | null;

  /** Deep-clone a layer and insert it right after the original, with a
   *  small offset so the copy is visible. Returns the new id. */
  duplicateLayer(id: LayerId, offset?: { dx: number; dy: number }): LayerId | null;

  /** Paste pre-serialized layers into the root group (or a target
   *  parent). Ids are rewritten; frames get a small offset. Returns the
   *  list of new ids (top-level only). */
  pasteLayers(layers: Layer[], opts?: { parentId?: LayerId; offset?: { dx: number; dy: number } }): LayerId[];

  /** Clear dirty flag — call after a successful save. */
  markClean(): void;
}

export type EditorStore = EditorState & EditorActions;

export type AlignMode =
  | "left"
  | "centerH"
  | "right"
  | "top"
  | "middleV"
  | "bottom";

/* ─── Helpers that operate on the Immer draft ─── */

function findParentAndIndex(
  root: Container,
  id: LayerId,
): { parent: Container; index: number } | null {
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!;
    if (c.id === id) return { parent: root, index: i };
    if (hasTypedChildren(c)) {
      const found = findParentAndIndex(c, id);
      if (found) return found;
    }
  }
  return null;
}

function findLayer(root: Container, id: LayerId): Layer | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    if (c.id === id) return c;
    if (hasTypedChildren(c)) {
      const sub = findLayer(c, id);
      if (sub) return sub;
    }
  }
  return null;
}

function collectDescendants(layer: Layer, set: Set<LayerId>) {
  set.add(layer.id);
  if (hasTypedChildren(layer)) {
    for (const c of layer.children) collectDescendants(c, set);
  }
}

function emptyScene(): SceneGraph {
  return {
    version: 1,
    root: {
      id: "scene_root",
      name: "페이지",
      type: "group",
      visible: true,
      locked: false,
      frame: { x: 0, y: 0, w: 0, h: 0 },
      style: {},
      children: [],
      virtual: true,
    },
  };
}

/* ─── Store ─── */

export const useEditorStore = create<EditorStore>()(
  temporal(
    (set, get) => ({
      scene: emptyScene(),
      selectedId: null,
      multiSelectedIds: new Set(),
      dirty: false,

      setScene: (scene) =>
        set(() => ({ scene, dirty: true, selectedId: null, multiSelectedIds: new Set() })),

      importHtml: (html) => {
        const scene = legacyHtmlToScene(html);
        // Importing existing content shouldn't mark the doc dirty.
        set(() => ({ scene, dirty: false, selectedId: null, multiSelectedIds: new Set() }));
      },

      exportHtml: () => sceneToLegacyHtml(get().scene),

      select: (id, opts) => {
        const { additive } = opts || {};
        if (!id) {
          set(() => ({ selectedId: null, multiSelectedIds: new Set() }));
          return;
        }
        if (!additive) {
          set(() => ({ selectedId: id, multiSelectedIds: new Set() }));
          return;
        }
        // Additive (Shift). Model: selection = { primary, ...others }.
        // Multi-set stores everyone *except* primary. Toggling the id:
        //  - If already selected anywhere, remove it and promote some
        //    remaining id to primary.
        //  - If not selected, make it primary and demote prior primary
        //    into the multi-set.
        const prev = get();
        const all = new Set<LayerId>(prev.multiSelectedIds);
        if (prev.selectedId) all.add(prev.selectedId);

        if (all.has(id)) {
          all.delete(id);
          const arr = Array.from(all);
          const newPrimary = arr[0] ?? null;
          const newMulti = new Set(arr.slice(1));
          set(() => ({ selectedId: newPrimary, multiSelectedIds: newMulti }));
        } else {
          const newMulti = new Set(all);
          set(() => ({ selectedId: id, multiSelectedIds: newMulti }));
        }
      },

      clearSelection: () =>
        set(() => ({ selectedId: null, multiSelectedIds: new Set() })),

      toggleVisibility: (id) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (l) l.visible = !l.visible;
          }),
          dirty: true,
        })),

      toggleLock: (id) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (l) l.locked = !l.locked;
          }),
          dirty: true,
        })),

      rename: (id, name) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (l) l.name = name;
          }),
          dirty: true,
        })),

      remove: (id) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const loc = findParentAndIndex(draft.root, id);
            if (loc) loc.parent.children.splice(loc.index, 1);
          }),
          selectedId: s.selectedId === id ? null : s.selectedId,
          dirty: true,
        })),

      moveLayer: (fromId, toParentId, toIndex) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const srcLoc = findParentAndIndex(draft.root, fromId);
            if (!srcLoc) return;
            const target = findLayer(draft.root, toParentId);
            if (!target || !hasTypedChildren(target)) return;
            // Sprint 9c — sections are "closed" containers. Their
            // children are anchored to `<!--scene-child:${id}-->`
            // placeholders in the shell template; cross-section moves
            // would detach a child from its anchor. Only permit moves
            // that keep source and target in the same section (i.e.
            // reorders within the same section), or moves that don't
            // touch any section at all.
            const srcInSection = isSection(srcLoc.parent);
            const dstIsSection = isSection(target);
            if ((srcInSection || dstIsSection) && srcLoc.parent !== target) return;
            // Guard: can't move a container into its own descendant.
            const banned = new Set<LayerId>();
            collectDescendants(srcLoc.parent.children[srcLoc.index]!, banned);
            if (banned.has(toParentId)) return;
            const [moved] = srcLoc.parent.children.splice(srcLoc.index, 1);
            const idx = Math.min(Math.max(0, toIndex), target.children.length);
            target.children.splice(idx, 0, moved!);
          }),
          dirty: true,
        })),

      group: (ids, groupName) => {
        if (ids.length === 0) return null;
        const first = ids[0]!;
        let newGroupId: LayerId | null = null;
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            // Find parent of first id; require siblings share the same parent
            // for Tier-1 (avoids cross-tree weirdness). Reject otherwise.
            const firstLoc = findParentAndIndex(draft.root, first);
            if (!firstLoc) return;
            const parent = firstLoc.parent;
            for (const id of ids) {
              const loc = findParentAndIndex(draft.root, id);
              if (!loc || loc.parent !== parent) return;
            }
            // Extract children in parent order.
            const indices = ids
              .map((id) => parent.children.findIndex((c) => c.id === id))
              .filter((i) => i >= 0)
              .sort((a, b) => a - b);
            const insertAt = indices[0]!;
            const collected: Layer[] = [];
            for (let k = indices.length - 1; k >= 0; k--) {
              collected.unshift(...parent.children.splice(indices[k]!, 1));
            }
            const newGroup: GroupLayer = {
              id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: groupName || "그룹",
              type: "group",
              visible: true,
              locked: false,
              frame: { x: 0, y: 0, w: 0, h: 0 },
              style: {},
              children: collected,
            };
            newGroupId = newGroup.id;
            parent.children.splice(insertAt, 0, newGroup);
          }),
          dirty: true,
        }));
        if (newGroupId) {
          set(() => ({ selectedId: newGroupId, multiSelectedIds: new Set() }));
        }
        return newGroupId;
      },

      ungroup: (groupId) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const loc = findParentAndIndex(draft.root, groupId);
            if (!loc) return;
            const target = loc.parent.children[loc.index];
            if (!target || target.type !== "group") return;
            loc.parent.children.splice(loc.index, 1, ...target.children);
          }),
          dirty: true,
        })),

      setTransform: (id, patch) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (!l) return;
            if (patch === null) {
              l.transform = undefined;
              return;
            }
            const next: LayerTransform = { ...(l.transform || {}), ...patch };
            // Normalize: drop identity so serialize stays clean.
            if (next.rotate === 0) delete next.rotate;
            if (next.scaleX === 1) delete next.scaleX;
            if (next.scaleY === 1) delete next.scaleY;
            const hasAny = Object.keys(next).length > 0;
            l.transform = hasAny ? next : undefined;
          }),
          dirty: true,
        })),

      alignLayers: (ids, mode) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            if (ids.length < 2) return;
            const layers: Layer[] = [];
            for (const id of ids) {
              const l = findLayer(draft.root, id);
              if (!l || l.id === draft.root.id) continue;
              // Sprint 9a — flow-positioned layers don't participate in
              // align (their frame.x/y aren't authored; aligning to them
              // would drag the bbox to 0,0 and warp real layers).
              const lk = new Set(l.frameKeys ?? []);
              const isAbs = lk.has("position") || lk.has("left") || lk.has("top");
              if (!isAbs) continue;
              layers.push(l);
            }
            if (layers.length < 2) return;

            // Bounding box (axis-aligned, using stored frame — ignores
            // transform rotation, which is what most design tools do for
            // align commands).
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of layers) {
              const { x, y, w, h } = l.frame;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x + w > maxX) maxX = x + w;
              if (y + h > maxY) maxY = y + h;
            }
            const boxW = maxX - minX;
            const boxH = maxY - minY;
            const cx = minX + boxW / 2;
            const cy = minY + boxH / 2;

            for (const l of layers) {
              // Sprint 9a/9b — skip flow-positioned layers and sections.
              if (isSection(l)) continue;
              const existingKeys = new Set(l.frameKeys ?? []);
              const layerIsAbsolute = existingKeys.has("position")
                || existingKeys.has("left")
                || existingKeys.has("top");
              if (!layerIsAbsolute) continue;

              const f = l.frame;
              switch (mode) {
                case "left":    f.x = minX; break;
                case "right":   f.x = maxX - f.w; break;
                case "centerH": f.x = Math.round(cx - f.w / 2); break;
                case "top":     f.y = minY; break;
                case "bottom":  f.y = maxY - f.h; break;
                case "middleV": f.y = Math.round(cy - f.h / 2); break;
              }
              // Ensure the serializer emits left/top/position so the change
              // is persisted. Preserve any existing keys + !important flags.
              const keys = new Set(existingKeys);
              keys.add("position");
              if (mode === "left" || mode === "right" || mode === "centerH") keys.add("left");
              if (mode === "top"  || mode === "bottom" || mode === "middleV") keys.add("top");
              l.frameKeys = Array.from(keys) as NonNullable<Layer["frameKeys"]>;
            }
          }),
          dirty: true,
        })),

      setFrame: (id, patch) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (!l || l.id === draft.root.id) return;

            // Sprint 9a — FLOW-ELEMENT INVARIANT.
            // If the layer was parsed without `position`/`left`/`top` in
            // its inline style, it's a flow-laid-out section (e.g.
            // `index-hero`). ANY frame mutation is dangerous:
            //  - x/y writes would emit `position:absolute; left; top;`
            //    on export, ripping the section out of flow.
            //  - w/h writes would override the template's CSS-driven
            //    responsive width (typically 100%) with a fixed pixel
            //    value, collapsing the section and letting following
            //    sections overlap it.
            // Reject the whole patch — this is the bug we shipped 9a to
            // kill. Upstream UI (drag handler, resize handles) should
            // have already been gated, this is defense-in-depth.
            // Sprint 9b — sections are flow regions by type-level contract.
            // Sprint 9e — allow width/height resize on sections, but never
            // position/left/top. Height commonly tweaked on hero regions.
            if (isSection(l)) {
              if (typeof patch.w === "number") l.frame.w = Math.max(1, Math.round(patch.w));
              if (typeof patch.h === "number") l.frame.h = Math.max(1, Math.round(patch.h));
              const keys = new Set(l.frameKeys ?? []);
              if (patch.w !== undefined) keys.add("width");
              if (patch.h !== undefined) keys.add("height");
              // Ensure position/left/top never land on sections — see
              // buildSectionLayer's safeKeys filter for the same rule.
              keys.delete("position"); keys.delete("left"); keys.delete("top");
              l.frameKeys = Array.from(keys) as NonNullable<Layer["frameKeys"]>;
              return;
            }
            const existingKeys = new Set(l.frameKeys ?? []);
            const layerIsAbsolute = existingKeys.has("position")
              || existingKeys.has("left")
              || existingKeys.has("top");
            if (!layerIsAbsolute) return;

            if (typeof patch.x === "number") l.frame.x = Math.round(patch.x);
            if (typeof patch.y === "number") l.frame.y = Math.round(patch.y);
            if (typeof patch.w === "number") l.frame.w = Math.max(1, Math.round(patch.w));
            if (typeof patch.h === "number") l.frame.h = Math.max(1, Math.round(patch.h));

            const keys = new Set(existingKeys);
            keys.add("position");
            if (patch.x !== undefined) keys.add("left");
            if (patch.y !== undefined) keys.add("top");
            if (patch.w !== undefined) keys.add("width");
            if (patch.h !== undefined) keys.add("height");
            l.frameKeys = Array.from(keys) as NonNullable<Layer["frameKeys"]>;
          }),
          dirty: true,
        })),

      explodeBox: (id) => {
        let newId: LayerId | null = null;
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const loc = findParentAndIndex(draft.root, id);
            if (!loc) return;
            const target = loc.parent.children[loc.index];
            if (!target || target.type !== "box") return;
            // Parse the box's innerHtml looking for .dragable children.
            let parsed: SceneGraph;
            try {
              parsed = legacyHtmlToScene(target.innerHtml);
            } catch {
              return;
            }
            if (parsed.root.children.length === 0) return;
            const group: GroupLayer = {
              id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: target.name || "그룹",
              type: "group",
              visible: target.visible,
              locked: target.locked,
              frame: { ...target.frame },
              frameKeys: target.frameKeys,
              frameImportant: target.frameImportant,
              transform: target.transform,
              style: target.style,
              children: parsed.root.children,
            };
            newId = group.id;
            loc.parent.children.splice(loc.index, 1, group);
          }),
          dirty: true,
        }));
        if (newId) set(() => ({ selectedId: newId, multiSelectedIds: new Set() }));
        return newId;
      },

      duplicateLayer: (id, offset) => {
        const dx = offset?.dx ?? 12;
        const dy = offset?.dy ?? 12;
        let newId: LayerId | null = null;
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const loc = findParentAndIndex(draft.root, id);
            if (!loc) return;
            const src = loc.parent.children[loc.index];
            if (!src) return;
            // Deep clone (structuredClone if available; immer drafts aren't
            // structured-cloneable directly, so fall back to JSON).
            let clone: Layer;
            try {
              clone = structuredClone(src) as Layer;
            } catch {
              clone = JSON.parse(JSON.stringify(src)) as Layer;
            }
            // Rewrite every id in the clone to avoid collisions.
            const rewrite = (l: Layer) => {
              l.id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              if (l.type === "group") for (const c of l.children) rewrite(c);
            };
            rewrite(clone);
            clone.frame = { ...clone.frame, x: clone.frame.x + dx, y: clone.frame.y + dy };
            // Ensure serializer emits left/top on the copy.
            const keys = new Set(clone.frameKeys ?? []);
            keys.add("position"); keys.add("left"); keys.add("top");
            clone.frameKeys = Array.from(keys) as NonNullable<Layer["frameKeys"]>;
            newId = clone.id;
            loc.parent.children.splice(loc.index + 1, 0, clone);
          }),
          dirty: true,
        }));
        if (newId) set(() => ({ selectedId: newId, multiSelectedIds: new Set() }));
        return newId;
      },

      pasteLayers: (layers, opts) => {
        const dx = opts?.offset?.dx ?? 12;
        const dy = opts?.offset?.dy ?? 12;
        const newIds: LayerId[] = [];
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const parent: GroupLayer = opts?.parentId
              ? (findLayer(draft.root, opts.parentId) as GroupLayer | null) ?? draft.root
              : draft.root;
            if (!parent || parent.type !== "group") return;
            const rewrite = (l: Layer) => {
              l.id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              if (l.type === "group") for (const c of l.children) rewrite(c);
            };
            for (const src of layers) {
              let clone: Layer;
              try { clone = structuredClone(src) as Layer; }
              catch { clone = JSON.parse(JSON.stringify(src)) as Layer; }
              rewrite(clone);
              clone.frame = { ...clone.frame, x: clone.frame.x + dx, y: clone.frame.y + dy };
              const keys = new Set(clone.frameKeys ?? []);
              keys.add("position"); keys.add("left"); keys.add("top");
              clone.frameKeys = Array.from(keys) as NonNullable<Layer["frameKeys"]>;
              parent.children.push(clone);
              newIds.push(clone.id);
            }
          }),
          dirty: true,
        }));
        if (newIds.length > 0) {
          set(() => ({
            selectedId: newIds[newIds.length - 1] ?? null,
            multiSelectedIds: new Set(newIds.slice(0, -1)),
          }));
        }
        return newIds;
      },

      markClean: () => set(() => ({ dirty: false })),
    }),
    {
      // zundo temporal options
      limit: 50,
      // Skip tracking selection / hover / dirty — only scene is persisted in history.
      partialize: (state) => ({ scene: state.scene }) as Partial<EditorState>,
      // Debounce rapid successive mutations (e.g. typing) into one history entry.
      handleSet: (handleSet) => {
        let last = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;
        return (state) => {
          const now = Date.now();
          // Coalesce within 400ms — enough to collapse a rename keystroke burst
          // but still capture discrete drag/resize commits.
          if (now - last < 400 && timer) {
            clearTimeout(timer);
          }
          timer = setTimeout(() => {
            handleSet(state);
            last = Date.now();
          }, 300);
        };
      },
    },
  ),
);

/* ─── Selectors (memo-friendly) ─── */

export const selectScene = (s: EditorStore) => s.scene;
export const selectRoot = (s: EditorStore) => s.scene.root;
export const selectSelectedId = (s: EditorStore) => s.selectedId;
export const selectMultiIds = (s: EditorStore) => s.multiSelectedIds;
export const selectDirty = (s: EditorStore) => s.dirty;

/** Access the temporal (undo/redo) API. */
export const useEditorHistory = () => useEditorStore.temporal;
