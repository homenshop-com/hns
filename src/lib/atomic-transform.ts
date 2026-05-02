import { JSDOM } from "jsdom";

/**
 * Heuristic transform that converts arbitrary Claude Designs / Claude Code
 * exported HTML into the homenshop atomic-layered structure the design editor
 * understands. The editor's selection / inspector / layer panel keys on:
 *   - .dragable                    — every editable element (selectable)
 *   - .dragable.sol-replacible-text — text-containing wrapper (Tiptap edit)
 *   - .dragable.de-group           — collapsible group in LayerPanel
 *   - obj_<role>_<n> ids           — unique per atomic, drives layer naming
 *
 * Source HTML usually has bare h1/h2/p/img/a tags directly inside sections.
 * This function wraps each atomic in its expected dragable parent so the
 * editor can select, label, and edit them. Idempotent: skips elements
 * already wrapped in .dragable.
 *
 * Trade-off vs an AI rewrite: heuristic is fast and free but covers ~80%
 * of common patterns (hero, feature cards, content sections). It does NOT
 * try to identify groups (de-group) or split overlay vs flow patterns —
 * the user can refine those in the editor later.
 */
export function atomizeBodyHtml(bodyHtml: string, pageSlug: string): string {
  if (!bodyHtml || !bodyHtml.trim()) return bodyHtml;

  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="__root">${bodyHtml}</div></body></html>`);
  const doc = dom.window.document;
  const root = doc.getElementById("__root");
  if (!root) return bodyHtml;

  const counter = { sec: 0, title: 0, text: 0, img: 0, btn: 0, list: 0, table: 0, box: 0, shape: 0, svg: 0 };
  const idPrefix = pageSlug ? sanitizeSlug(pageSlug) + "_" : "";

  function newId(role: keyof typeof counter): string {
    counter[role] += 1;
    return `obj_${idPrefix}${role}_${counter[role]}`;
  }

  function isAlreadyDragable(el: Element): boolean {
    return el.classList && el.classList.contains("dragable");
  }

  function isInteractiveBtn(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return true;
    if (tag === "a") {
      const cls = (el.getAttribute("class") || "").toLowerCase();
      if (/\bbtn\b|\bbutton\b|\bcta\b/.test(cls)) return true;
    }
    return false;
  }

  function wrap(el: Element, role: keyof typeof counter, extraClass = ""): void {
    if (!el.parentNode) return;
    const wrapper = doc.createElement("div");
    wrapper.className = `dragable${extraClass ? " " + extraClass : ""}`;
    wrapper.id = newId(role);
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }

  function isAtomicCandidate(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    return /^(h[1-6]|p|img|a|button|ul|ol|table)$/.test(tag);
  }

  // A standalone "shape" — empty/decorative div with visual styling that
  // the editor should be able to select, move, and replace. AI-generated
  // hero layouts frequently include these (e.g. an absolute-positioned
  // arch, blob, or color block sitting next to the headline) and the
  // base atomizer skips them because they don't contain h1/p/img/a.
  function isShapeCandidate(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (!/^(div|section|aside|figure|span)$/.test(tag)) return false;
    if (isAlreadyDragable(el)) return false;
    if (hasAtomicDescendants(el)) return false;
    if (hasDragableDescendant(el)) return false;
    const style = (el.getAttribute("style") || "").toLowerCase();
    const cls = (el.getAttribute("class") || "").toLowerCase();
    const hasVisualStyle =
      /background[-:]|height\s*:|min-height|aspect-ratio|border[-:]|border-radius|transform\s*:|clip-path|mask\s*:|box-shadow|filter\s*:/.test(
        style,
      );
    const hasPositionedSize =
      /position\s*:\s*(absolute|fixed)/.test(style) &&
      /(width\s*:|height\s*:|inset\s*:|top\s*:|left\s*:|right\s*:|bottom\s*:)/.test(style);
    const hasVisualClass =
      /\b(shape|deco|decorative|bg-|background|circle|arch|blob|illustration|hero-image|placeholder|graphic|ornament|accent)\b/.test(
        cls,
      );
    return hasVisualStyle || hasPositionedSize || hasVisualClass;
  }

  // Inline SVGs used as decorative graphics — wrap so they're selectable.
  function isStandaloneSvg(el: Element): boolean {
    return el.tagName.toLowerCase() === "svg" && !isAlreadyDragable(el);
  }

  function hasAtomicDescendants(el: Element): boolean {
    return el.querySelector("h1,h2,h3,h4,h5,h6,p,img,a,button,ul,ol,table") !== null;
  }

  function hasDragableDescendant(el: Element): boolean {
    return el.querySelector(".dragable") !== null;
  }

  // First pass: collect atomic + shape + svg candidates in one walk.
  // When we find a shape/svg we don't recurse into it (its inner empty
  // markup is part of the decoration, not separate atomics).
  const atomicCandidates: Element[] = [];
  const shapeCandidates: Element[] = [];
  const svgCandidates: Element[] = [];
  function collect(node: Element): void {
    for (const child of Array.from(node.children)) {
      if (isAlreadyDragable(child)) continue;
      if (isAtomicCandidate(child)) {
        atomicCandidates.push(child);
        continue;
      }
      if (isStandaloneSvg(child)) {
        svgCandidates.push(child);
        continue;
      }
      if (isShapeCandidate(child)) {
        shapeCandidates.push(child);
        continue;
      }
      collect(child);
    }
  }
  collect(root);

  for (const el of atomicCandidates) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      wrap(el, "title", "sol-replacible-text");
    } else if (tag === "p") {
      wrap(el, "text", "sol-replacible-text");
    } else if (tag === "img") {
      wrap(el, "img");
    } else if (tag === "ul" || tag === "ol") {
      wrap(el, "list");
    } else if (tag === "table") {
      wrap(el, "table");
    } else if (isInteractiveBtn(el)) {
      wrap(el, "btn");
    }
  }

  for (const el of shapeCandidates) {
    wrap(el, "shape");
  }

  for (const el of svgCandidates) {
    wrap(el, "svg");
  }

  // Second pass: wrap top-level non-dragable block containers as sections.
  // We treat direct children of root that aren't already dragable AND
  // aren't atomic-wrapped (handled above) as sections. This catches
  // <section>/<div>/<article> blocks that hold groups of content.
  for (const child of Array.from(root.children)) {
    if (isAlreadyDragable(child)) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === "script" || tag === "style") continue;
    wrap(child, "sec");
  }

  return root.innerHTML;
}

function sanitizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, "");
}
