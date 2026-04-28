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

  const counter = { sec: 0, title: 0, text: 0, img: 0, btn: 0, list: 0, table: 0, box: 0 };
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

  // First pass: find all atomic candidates that aren't already wrapped.
  // Walk the tree and process each. We collect first to avoid mutating
  // during traversal.
  const candidates: Element[] = [];
  function collect(node: Element): void {
    for (const child of Array.from(node.children)) {
      if (isAlreadyDragable(child)) continue;
      if (isAtomicCandidate(child)) {
        candidates.push(child);
      } else {
        collect(child);
      }
    }
  }
  collect(root);

  for (const el of candidates) {
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
