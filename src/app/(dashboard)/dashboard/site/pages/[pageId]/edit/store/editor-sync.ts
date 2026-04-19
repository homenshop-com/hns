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

import {
  DRAGABLE_CLASS,
  GROUP_CLASS,
  hasTypedChildren,
  type GroupLayer,
  type Layer,
  type LayerId,
  type SceneGraph,
} from "@/lib/scene";
import { printTransform, printTransformOrigin } from "@/lib/scene/parse-transform";

const HIDDEN_ATTR = "data-de-hidden";
const LOCKED_ATTR = "data-de-locked";
const HIDDEN_STYLE_OPACITY = "0.3";

/* ─── Helpers ─── */

function walk(root: GroupLayer, fn: (l: Layer) => void) {
  const recur = (node: Layer | GroupLayer) => {
    if (hasTypedChildren(node)) {
      for (const c of node.children) {
        fn(c);
        recur(c);
      }
    }
  };
  recur(root);
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

/* ─── Structure (order + group wrappers) ─── */

/**
 * Find an existing DOM node with the given id anywhere inside `root`.
 * We search globally (not just direct children) because group/ungroup
 * operations may have parked nodes at arbitrary depth.
 */
function findById(root: HTMLElement, id: string): HTMLElement | null {
  if (root.id === id) return root;
  return root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
}

/** Ensure a `.de-group.dragable` wrapper div exists for a scene group.
 *  Creates one if missing. Returns the element. */
function ensureGroupWrapper(
  root: HTMLElement,
  group: GroupLayer,
): HTMLElement {
  let el = findById(root, group.id);
  if (el) {
    // Make sure it carries the expected classes for CSS / publisher.
    if (!el.classList.contains(DRAGABLE_CLASS)) el.classList.add(DRAGABLE_CLASS);
    if (!el.classList.contains(GROUP_CLASS)) el.classList.add(GROUP_CLASS);
    return el;
  }
  el = document.createElement("div");
  el.id = group.id;
  el.className = `${GROUP_CLASS} ${DRAGABLE_CLASS}`;
  el.style.position = "absolute";
  el.style.left = `${group.frame.x}px`;
  el.style.top = `${group.frame.y}px`;
  return el;
}

/** Push the layer's frame (x/y/w/h) into the DOM element's inline style
 *  based on `frameKeys`. Ensures V2 store mutations (resize, align,
 *  nudge, duplicate) are immediately visible on the canvas. Skipped for
 *  virtual groups (root). */
function applyFrameToEl(el: HTMLElement, layer: Layer) {
  if (layer.type === "group" && (layer as GroupLayer).virtual) return;
  const keys = new Set(layer.frameKeys ?? []);
  if (keys.has("position")) el.style.position = "absolute";
  if (keys.has("left")) el.style.left = `${layer.frame.x}px`;
  if (keys.has("top")) el.style.top = `${layer.frame.y}px`;
  if (keys.has("width")) el.style.width = `${layer.frame.w}px`;
  if (keys.has("height")) el.style.height = `${layer.frame.h}px`;
}

/** Apply the scene's transform (rotate/scale/origin) to a DOM node. */
function applyTransformToEl(el: HTMLElement, layer: Layer) {
  const tfm = printTransform(layer.transform);
  if (tfm) el.style.transform = tfm;
  else el.style.removeProperty("transform");
  const tfo = printTransformOrigin(layer.transform);
  if (tfo) el.style.transformOrigin = tfo;
  else el.style.removeProperty("transform-origin");
}

/**
 * Reconcile DOM structure to match the scene tree:
 *  - Groups get (or reuse) a `.de-group.dragable` wrapper div.
 *  - Children of each scene group are appended to the corresponding
 *    wrapper in scene order.
 *  - Non-scene elements inside `container` stay untouched at their
 *    relative position.
 *  - Transform is pushed to each node.
 *
 * This is what turns a "group" store action into actual DOM nesting.
 */
export function applyStructure(scene: SceneGraph, container: HTMLElement) {
  const reconcile = (node: GroupLayer | import("@/lib/scene").SectionLayer, domParent: HTMLElement) => {
    // Track the previous scene-ordered dragable that is already in
    // `domParent`. Used to detect out-of-order nodes without blindly
    // appending (which would push every dragable past any non-dragable
    // siblings that happen to live between them).
    let prevInOrder: HTMLElement | null = null;
    for (const child of node.children) {
      let childEl: HTMLElement | null;
      if (child.type === "group") {
        childEl = ensureGroupWrapper(container, child);
      } else {
        childEl = findById(container, child.id);
      }
      if (!childEl) continue;

      if (childEl.parentElement !== domParent) {
        // Cross-parent move (group/ungroup, paste into different parent).
        // Append at end — the outer loop will handle subsequent order.
        domParent.appendChild(childEl);
      } else if (prevInOrder) {
        // Same parent — only move if the current DOM order doesn't
        // already place childEl after prevInOrder. This preserves any
        // non-dragable siblings interleaved with layers.
        const pos = childEl.compareDocumentPosition(prevInOrder);
        const childIsBeforePrev = (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        if (childIsBeforePrev) {
          // childEl comes before prev — swap by inserting after prev.
          prevInOrder.after(childEl);
        }
      }
      prevInOrder = childEl;

      applyFrameToEl(childEl, child);
      applyTransformToEl(childEl, child);
      if (hasTypedChildren(child)) {
        reconcile(child, childEl);
      }
    }
  };
  reconcile(scene.root, container);
}

/**
 * Back-compat alias for the flat-only order sync used pre-Tier-2.
 * New code should prefer `applyStructure`.
 */
export function applyOrder(scene: SceneGraph, container: HTMLElement) {
  applyStructure(scene, container);
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
  // Order matters: structure first (moves children into the correct
  // parents, creating group wrappers as needed). Prune second so we
  // only remove wrappers that are genuinely orphan after the move.
  applyStructure(scene, container);
  pruneOrphans(scene, container);
  applyVisibilityAndLock(scene, container);
}
