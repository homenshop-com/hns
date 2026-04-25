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
import { applyMobileCssToScene, hasTypedChildren, isSection, legacyHtmlToScene, sceneToLegacyHtml } from "@/lib/scene";
import type {
  BoxLayer,
  GroupLayer,
  ImageLayer,
  Layer,
  LayerId,
  LayerInteraction,
  LayerStyle,
  LayerTransform,
  SceneGraph,
  SectionLayer,
} from "@/lib/scene";

/** A Layer that owns a `children: Layer[]` array — groups (incl. the
 *  virtual root) and sections (since Sprint 9c). */
type Container = GroupLayer | SectionLayer;

/* ─── State shape ─── */

/** Which breakpoint bucket the editor is currently editing. All drag/
 *  resize/transform mutations are routed to the active viewport's fields,
 *  so users can position/size each layer independently per breakpoint. */
export type ViewportMode = "desktop" | "mobile";

export interface EditorState {
  scene: SceneGraph;
  /** Primary selection. Null when nothing selected. */
  selectedId: LayerId | null;
  /** Additional ids in a multi-selection (excludes `selectedId`). */
  multiSelectedIds: Set<LayerId>;
  /** Dirty flag — set by any mutation, cleared after successful save. */
  dirty: boolean;
  /** Active editing viewport. Starts at "desktop". */
  viewportMode: ViewportMode;
}

export interface EditorActions {
  /** Replace the entire scene (used by initial load, AI edit, undo-all). */
  setScene(scene: SceneGraph): void;
  /** Import HTML into the scene in one shot. */
  /** Import legacy body HTML. If `pageCss` is provided, any
   *  `@media (max-width: 768px)` override block inside it is merged into
   *  each layer's mobileFrame/mobileTransform for round-trip editing. */
  importHtml(html: string, pageCss?: string): void;
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

  /**
   * Merge a style patch into a layer (typography, fill, border, effect,
   * opacity, etc.). Pass `undefined` for any individual key to clear it.
   * Sprint 9k — wires the InspectorPanel's design tab to the scene graph.
   */
  setStyle(id: LayerId, patch: Partial<LayerStyle>): void;

  /**
   * Set or clear a click-time interaction on a layer. `null` removes the
   * interaction entry. Sprint 9k — powers the 인터랙션 tab's link/scroll/
   * modal actions, which are rendered into the published HTML at publish
   * time (see plugin-renderer + published route).
   */
  setInteraction(id: LayerId, patch: LayerInteraction | null): void;

  /**
   * Update an ImageLayer's source / alt / href / object-fit. Mutates the
   * typed fields AND rewrites `innerHtml` in parallel so the serializer
   * (which uses innerHtml as the source of truth) emits the new image.
   * Empty string in any patch field clears that field.
   */
  setImage(
    id: LayerId,
    patch: Partial<{
      src: string;
      alt: string;
      href: string;
      hrefTarget: string;
      objectFit: ImageLayer["objectFit"];
    }>,
  ): void;

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

  /** Switch the active editing viewport. Subsequent drag/resize/transform
   *  mutations target this viewport's override fields. Does NOT re-render
   *  the canvas by itself — callers should propagate to the canvas width
   *  and to applyFrameToEl/applyTransformToEl on every layer. */
  setViewportMode(mode: ViewportMode): void;
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

/** Image attribute set used by both ImageLayer and BoxLayer (whose
 *  `<img>` lives entirely inside innerHtml). */
type ImageAttrs = {
  src: string;
  alt?: string;
  href?: string;
  hrefTarget?: string;
  objectFit?: ImageLayer["objectFit"];
};

/**
 * Rewrite an innerHtml blob's inner `<img>` (and optional outer `<a>`)
 * to reflect the given attributes. Used by `setImage` for both image
 * and box layers. Falls back to minimal markup if no `<img>` was found.
 *
 * Sizing behavior — the wrapper's `<img>` is forced to fill its parent
 * (`width:100%; height:100%`) and gets a default `object-fit: cover`
 * when none was specified. Without this, replacing a 1920×1280 photo
 * into a 307×384 wrapper would render at the photo's natural size and
 * blow out the layout. Users opt out of cropping by switching object-fit
 * to `contain` / `none` in the Inspector.
 */
function rewriteImageInnerHtml(prev: string, attrs: ImageAttrs): string {
  if (typeof window === "undefined" || !window.DOMParser) {
    const altAttr = attrs.alt ? ` alt="${escapeAttr(attrs.alt)}"` : "";
    return `<img src="${escapeAttr(attrs.src ?? "")}"${altAttr} style="width:100%;height:100%;object-fit:${attrs.objectFit ?? "cover"};" />`;
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = prev ?? "";
  const imgEl = wrapper.querySelector("img");
  if (!imgEl) {
    const altAttr = attrs.alt ? ` alt="${escapeAttr(attrs.alt)}"` : "";
    return `<img src="${escapeAttr(attrs.src ?? "")}"${altAttr} style="width:100%;height:100%;object-fit:${attrs.objectFit ?? "cover"};" />`;
  }
  imgEl.setAttribute("src", attrs.src ?? "");
  if (attrs.alt) imgEl.setAttribute("alt", attrs.alt);
  else imgEl.removeAttribute("alt");
  // Force img to fill its wrapper — replaces any pre-existing inline
  // width/height (which were tuned to the original template image's
  // natural size and would clip / overflow with a swapped photo).
  imgEl.style.setProperty("width", "100%");
  imgEl.style.setProperty("height", "100%");
  // Default object-fit: cover (most natural result for hero / card images).
  // User can override via Inspector → "맞춤" toggle, including "none" to
  // restore raw natural sizing when intentional.
  const fit = attrs.objectFit ?? "cover";
  if (fit === "none") imgEl.style.removeProperty("object-fit");
  else imgEl.style.setProperty("object-fit", fit);
  const a = wrapper.querySelector("a");
  if (a) {
    if (attrs.href) a.setAttribute("href", attrs.href);
    else a.removeAttribute("href");
    if (attrs.hrefTarget) a.setAttribute("target", attrs.hrefTarget);
    else a.removeAttribute("target");
  }
  return wrapper.innerHTML;
}

/** Inverse of rewriteImageInnerHtml — read attrs out of an innerHtml
 *  blob. Returns null if there's no `<img>` (caller should treat the
 *  layer as not-an-image). Used by setImage for box layers and by the
 *  Inspector to populate field defaults. */
export function readImgFromInnerHtml(html: string): ImageAttrs | null {
  if (typeof window === "undefined" || !window.DOMParser) return null;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html ?? "";
  const imgEl = wrapper.querySelector("img");
  if (!imgEl) return null;
  const a = wrapper.querySelector("a");
  const fit = (imgEl.style.objectFit || imgEl.getAttribute("style")?.match(/object-fit:\s*([\w-]+)/)?.[1] || "") as string;
  return {
    src: imgEl.getAttribute("src") ?? "",
    alt: imgEl.getAttribute("alt") ?? undefined,
    href: a?.getAttribute("href") ?? undefined,
    hrefTarget: a?.getAttribute("target") ?? undefined,
    objectFit: (fit as ImageAttrs["objectFit"]) || undefined,
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

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
      viewportMode: "desktop",

      setViewportMode: (mode) => set(() => ({ viewportMode: mode })),

      setScene: (scene) =>
        set(() => ({ scene, dirty: true, selectedId: null, multiSelectedIds: new Set() })),

      importHtml: (html, pageCss) => {
        const scene = legacyHtmlToScene(html);
        // Sprint 9g — overlay mobile viewport overrides from pageCss so
        // the editor sees the same per-viewport values that published
        // visitors see. Idempotent; no-op if no @media block exists.
        if (pageCss) applyMobileCssToScene(scene, pageCss);
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

      setStyle: (id, patch) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (!l) return;
            // Merge with empty-string / null treated as "clear this key".
            // Treating "" as clear lets the Inspector color/text inputs
            // remove a value by blanking the field.
            const next: LayerStyle = { ...(l.style ?? {}) };
            for (const [k, v] of Object.entries(patch) as Array<
              [keyof LayerStyle, LayerStyle[keyof LayerStyle]]
            >) {
              if (v === undefined || v === null || v === "") {
                delete next[k];
              } else {
                // Type assertion: TS loses the value-type correlation
                // when iterating Object.entries(). Runtime shape matches.
                (next as Record<string, unknown>)[k as string] = v;
              }
            }
            l.style = next;
          }),
          dirty: true,
        })),

      setInteraction: (id, patch) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (!l) return;
            if (patch === null) {
              l.interaction = undefined;
            } else {
              l.interaction = patch;
            }
          }),
          dirty: true,
        })),

      setImage: (id, patch) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (!l) return;
            if (l.type === "image") {
              const img = l as ImageLayer;
              if (patch.src !== undefined) img.src = patch.src;
              if (patch.alt !== undefined) img.alt = patch.alt || undefined;
              if (patch.href !== undefined) img.href = patch.href || undefined;
              if (patch.hrefTarget !== undefined) img.hrefTarget = patch.hrefTarget || undefined;
              if (patch.objectFit !== undefined) img.objectFit = patch.objectFit;
              img.innerHtml = rewriteImageInnerHtml(img.innerHtml, {
                src: img.src ?? "",
                alt: img.alt,
                href: img.href,
                hrefTarget: img.hrefTarget,
                objectFit: img.objectFit,
              });
            } else if (l.type === "box") {
              // Box layers don't have typed src/alt fields; the editable
              // image lives entirely inside `innerHtml` (e.g., a `.frame`
              // wrapper around an <img> with overlay siblings). Read the
              // current attrs out of innerHtml, merge the patch, and
              // rewrite. Layers without an <img> remain a no-op.
              const box = l as BoxLayer;
              const current = readImgFromInnerHtml(box.innerHtml ?? "");
              if (!current) return;
              box.innerHtml = rewriteImageInnerHtml(box.innerHtml ?? "", {
                src: patch.src ?? current.src ?? "",
                alt: patch.alt !== undefined ? patch.alt : current.alt,
                href: patch.href !== undefined ? patch.href : current.href,
                hrefTarget: patch.hrefTarget !== undefined ? patch.hrefTarget : current.hrefTarget,
                objectFit: patch.objectFit !== undefined ? patch.objectFit : current.objectFit,
              });
            }
          }),
          dirty: true,
        })),

      setTransform: (id, patch) =>
        set((s) => ({
          scene: produce(s.scene, (draft) => {
            const l = findLayer(draft.root, id);
            if (!l) return;
            const mobileMode = s.viewportMode === "mobile";
            if (patch === null) {
              if (mobileMode) l.mobileTransform = undefined;
              else l.transform = undefined;
              return;
            }
            // Seed mobile override from desktop when first editing in
            // mobile mode, so the user picks up where desktop left off.
            const base = mobileMode
              ? (l.mobileTransform ?? l.transform ?? {})
              : (l.transform ?? {});
            const next: LayerTransform = { ...base, ...patch };
            // Normalize: drop identity so serialize stays clean.
            if (next.rotate === 0) delete next.rotate;
            if (next.scaleX === 1) delete next.scaleX;
            if (next.scaleY === 1) delete next.scaleY;
            const hasAny = Object.keys(next).length > 0;
            if (mobileMode) l.mobileTransform = hasAny ? next : undefined;
            else l.transform = hasAny ? next : undefined;
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

            const mobileMode = s.viewportMode === "mobile";

            // Sections: same flow-guard rules regardless of viewport —
            // page regions must never gain position/left/top. We allow
            // width/height resize, per-viewport.
            if (isSection(l)) {
              if (mobileMode) {
                // Seed mobileFrame from desktop frame on first mobile edit.
                const base = l.mobileFrame ?? { ...l.frame };
                if (typeof patch.w === "number") base.w = Math.max(1, Math.round(patch.w));
                if (typeof patch.h === "number") base.h = Math.max(1, Math.round(patch.h));
                l.mobileFrame = base;
                const keys = new Set(l.mobileFrameKeys ?? []);
                if (patch.w !== undefined) keys.add("width");
                if (patch.h !== undefined) keys.add("height");
                keys.delete("position"); keys.delete("left"); keys.delete("top");
                l.mobileFrameKeys = Array.from(keys) as NonNullable<Layer["mobileFrameKeys"]>;
                return;
              }
              if (typeof patch.w === "number") l.frame.w = Math.max(1, Math.round(patch.w));
              if (typeof patch.h === "number") l.frame.h = Math.max(1, Math.round(patch.h));
              const keys = new Set(l.frameKeys ?? []);
              if (patch.w !== undefined) keys.add("width");
              if (patch.h !== undefined) keys.add("height");
              keys.delete("position"); keys.delete("left"); keys.delete("top");
              l.frameKeys = Array.from(keys) as NonNullable<Layer["frameKeys"]>;
              return;
            }
            // Non-section layer: atomic child, box, image, text, group.
            // Sprint 9f — auto-promote to absolute on any x/y patch.
            // Sprint 9g — when in mobile viewport mode, route the write
            // to mobileFrame/mobileFrameKeys so desktop positioning is
            // preserved. On first mobile-mode touch, mobileFrame is
            // seeded from the desktop frame so the element doesn't jump.
            if (mobileMode) {
              const base = l.mobileFrame ?? { ...l.frame };
              if (typeof patch.x === "number") base.x = Math.round(patch.x);
              if (typeof patch.y === "number") base.y = Math.round(patch.y);
              if (typeof patch.w === "number") base.w = Math.max(1, Math.round(patch.w));
              if (typeof patch.h === "number") base.h = Math.max(1, Math.round(patch.h));
              l.mobileFrame = base;
              // Seed mobileFrameKeys from desktop frameKeys on first edit
              // so width/height inherited from desktop stay declared.
              const keys = new Set(l.mobileFrameKeys ?? l.frameKeys ?? []);
              if (patch.x !== undefined || patch.y !== undefined) keys.add("position");
              if (patch.x !== undefined) keys.add("left");
              if (patch.y !== undefined) keys.add("top");
              if (patch.w !== undefined) keys.add("width");
              if (patch.h !== undefined) keys.add("height");
              l.mobileFrameKeys = Array.from(keys) as NonNullable<Layer["mobileFrameKeys"]>;
              return;
            }

            if (typeof patch.x === "number") l.frame.x = Math.round(patch.x);
            if (typeof patch.y === "number") l.frame.y = Math.round(patch.y);
            if (typeof patch.w === "number") l.frame.w = Math.max(1, Math.round(patch.w));
            if (typeof patch.h === "number") l.frame.h = Math.max(1, Math.round(patch.h));

            const keys = new Set(l.frameKeys ?? []);
            // Auto-promote: if x or y is being set, the layer becomes
            // absolutely positioned. If only w/h is being set, leave the
            // current positioning mode alone (flow stays flow, absolute
            // stays absolute).
            if (patch.x !== undefined || patch.y !== undefined) {
              keys.add("position");
            }
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
export const selectViewportMode = (s: EditorStore) => s.viewportMode;

/** Access the temporal (undo/redo) API. */
export const useEditorHistory = () => useEditorStore.temporal;
