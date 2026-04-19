/**
 * editor-sync — Reconcile the V2 scene-graph store *into* the live
 * DOM-first canvas.
 *
 * The existing editor is DOM-first: drag/resize/TipTap write directly
 * into the `#hns_body` ref. The V2 scene graph is a parallel, typed
 * representation used by the LayerPanel. When the panel mutates scene
 * state (toggle visibility, lock, reorder, delete), the DOM must catch
 * up — otherwise the canvas would show stale state.
 *
 * This module is the one-way store→DOM bridge. DOM→store selection is
 * handled separately at the click-handler site.
 *
 * Invariants:
 *  - Only touch nodes with `.dragable` class. Never rewrite structural
 *    markup — that's the renderer's job.
 *  - All modifications are idempotent and tagged with `data-de-*`
 *    attributes so repeated calls don't compound side-effects, and a
 *    clean pass (scene says everything visible/unlocked) removes them.
 *  - Groups: walk recursively. Nested `.de-group.dragable` wrappers are
 *    respected but not required — flat bodies (most real pages today)
 *    work too.
 */

import type { GroupLayer, Layer, LayerId, SceneGraph } from "@/lib/scene";

const HIDDEN_ATTR = "data-de-hidden";
const LOCKED_ATTR = "data-de-locked";
const HIDDEN_STYLE_OPACITY = "0.3";

/* ─── Helpers ─── */

function walk(root: GroupLayer, fn: (l: Layer) => void) {
  for (const c of root.children) {
    fn(c);
    if (c.type === "group") walk(c, fn);
  }
}

function collectIds(root: GroupLayer): Set<LayerId> {
  const out = new Set<LayerId>();
  walk(root, (l) => out.add(l.id));
  return out;
}

/* ─── Visibility / lock ─── */

/**
 * For every `.dragable` element in the container, apply visibility and
 * lock state derived from the scene. Elements not present in the scene
 * are cleaned of our attributes but otherwise untouched (see
 * `pruneOrphans` for deletion).
 */
export function applyVisibilityAndLock(
  scene: SceneGraph,
  container: HTMLElement,
) {
  const byId = new Map<LayerId, Layer>();
  walk(scene.root, (l) => byId.set(l.id, l));

  const nodes = container.querySelectorAll<HTMLElement>(".dragable");
  nodes.forEach((el) => {
    if (!el.id) return;
    const layer = byId.get(el.id);
    if (!layer) {
      // Orphan — leave alone (pruneOrphans decides removal).
      return;
    }

    // Visibility: we represent "hidden" as opacity:0.3 + pointer-events:none
    // in the editor (so users can still see and re-select the layer). The
    // published/serialized payload preserves the boolean; publisher can
    // choose to honor it literally (display:none) on the live site.
    if (!layer.visible) {
      if (!el.hasAttribute(HIDDEN_ATTR)) {
        el.setAttribute(HIDDEN_ATTR, "1");
        el.dataset.deHiddenPrevOpacity = el.style.opacity || "";
      }
      el.style.opacity = HIDDEN_STYLE_OPACITY;
    } else if (el.hasAttribute(HIDDEN_ATTR)) {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.opacity = el.dataset.deHiddenPrevOpacity || "";
      delete el.dataset.deHiddenPrevOpacity;
    }

    // Lock: block pointer events on the element so drag/resize is
    // disabled, but leave children (TipTap etc.) alone.
    if (layer.locked) {
      if (!el.hasAttribute(LOCKED_ATTR)) {
        el.setAttribute(LOCKED_ATTR, "1");
        el.dataset.deLockedPrevPe = el.style.pointerEvents || "";
      }
      el.style.pointerEvents = "none";
    } else if (el.hasAttribute(LOCKED_ATTR)) {
      el.removeAttribute(LOCKED_ATTR);
      el.style.pointerEvents = el.dataset.deLockedPrevPe || "";
      delete el.dataset.deLockedPrevPe;
    }
  });
}

/* ─── Order ─── */

/**
 * Reorder DOM children inside `container` to match the top-level order
 * of `scene.root.children`. We only touch direct children that are
 * `.dragable` (the typical body layout) — anything else stays put at
 * its original DOM index.
 */
export function applyOrder(scene: SceneGraph, container: HTMLElement) {
  const desired = scene.root.children.map((c) => c.id);
  const byId = new Map<string, HTMLElement>();
  for (const el of Array.from(container.children)) {
    if (el instanceof HTMLElement && el.classList.contains("dragable") && el.id) {
      byId.set(el.id, el);
    }
  }
  // Re-append in the desired order. Nodes not in `desired` keep their
  // relative order at the start of the container.
  for (const id of desired) {
    const el = byId.get(id);
    if (el) container.appendChild(el);
  }
}

/* ─── Deletion ─── */

/**
 * Remove any `.dragable` node in the container whose id isn't present
 * in the scene. Used after the LayerPanel deletes layers.
 */
export function pruneOrphans(scene: SceneGraph, container: HTMLElement) {
  const live = collectIds(scene.root);
  const toRemove: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
    if (!el.id) return;
    if (!live.has(el.id)) toRemove.push(el);
  });
  for (const el of toRemove) el.remove();
}

/* ─── Selection ─── */

/**
 * Apply `.de-selected` class to the DOM nodes matching the store's
 * primary + multi-selection. Other nodes have the class removed.
 */
export function applySelection(
  primary: LayerId | null,
  multi: Set<LayerId>,
  container: HTMLElement,
) {
  const wanted = new Set<LayerId>(multi);
  if (primary) wanted.add(primary);

  container.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
    if (!el.id) return;
    if (wanted.has(el.id)) el.classList.add("de-selected");
    else el.classList.remove("de-selected");
  });
}

/* ─── Umbrella ─── */

/**
 * Run all store→DOM reconciliations in order. Safe to call on every
 * scene change; each step is cheap (O(N) DOM walk, no layout thrash
 * beyond what the mutations actually require).
 */
export function syncStoreToDom(scene: SceneGraph, container: HTMLElement) {
  pruneOrphans(scene, container);
  applyOrder(scene, container);
  applyVisibilityAndLock(scene, container);
}
