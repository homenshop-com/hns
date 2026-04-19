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
import { legacyHtmlToScene, sceneToLegacyHtml } from "@/lib/scene";
import type {
  GroupLayer,
  Layer,
  LayerId,
  SceneGraph,
} from "@/lib/scene";

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

  /** Clear dirty flag — call after a successful save. */
  markClean(): void;
}

export type EditorStore = EditorState & EditorActions;

/* ─── Helpers that operate on the Immer draft ─── */

function findParentAndIndex(
  root: GroupLayer,
  id: LayerId,
): { parent: GroupLayer; index: number } | null {
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!;
    if (c.id === id) return { parent: root, index: i };
    if (c.type === "group") {
      const found = findParentAndIndex(c, id);
      if (found) return found;
    }
  }
  return null;
}

function findLayer(root: GroupLayer, id: LayerId): Layer | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    if (c.id === id) return c;
    if (c.type === "group") {
      const sub = findLayer(c, id);
      if (sub) return sub;
    }
  }
  return null;
}

function collectDescendants(layer: Layer, set: Set<LayerId>) {
  set.add(layer.id);
  if (layer.type === "group") {
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
            if (!target || target.type !== "group") return;
            // Guard: can't move a group into its own descendant.
            const banned = new Set<LayerId>();
            collectDescendants(srcLoc.parent.children[srcLoc.index]!, banned);
            if (banned.has(toParentId)) return;
            const [moved] = srcLoc.parent.children.splice(srcLoc.index, 1);
            const t = target as GroupLayer;
            const idx = Math.min(Math.max(0, toIndex), t.children.length);
            t.children.splice(idx, 0, moved!);
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
