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

  // True when `el` is a "tight" dragable wrapper around a single atomic —
  // i.e. it already follows the atomized convention
  // `<div class="dragable" id="obj_img_1"><img></div>`. We must NOT
  // re-wrap atomics that already sit alone inside such a wrapper.
  function isTightDragableWrapper(el: Element | null): boolean {
    return !!el && isAlreadyDragable(el) && el.childElementCount === 1;
  }

  // Pre-pass: CSS background-image → real <img> object.
  // AI-generated and Claude-Designs cards frequently put the hero photo
  // on a div as `style="background-image:url(...)"`. The editor only
  // treats <img> tags as selectable/swappable image objects, so a bg
  // photo is invisible to the layer panel + image picker. We extract the
  // url into an absolutely-positioned <img>, wrap it in its own
  // .dragable, and insert it as the first child of the host (badges /
  // overlays inside already use z-index so they stay on top). The host
  // keeps its box but loses the background declaration.
  function extractBackgroundImages(): void {
    const hosts = Array.from(root!.querySelectorAll('[style*="background-image"]'));
    for (const el of hosts) {
      const style = el.getAttribute("style") || "";
      const m = /background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(style);
      if (!m) continue;
      const url = m[1].replace(/&amp;/g, "&").trim();
      // Skip data URIs and gradient stacks — not real swappable photos.
      if (!url || /^data:/i.test(url)) continue;
      // Don't double-process if a dragable img wrapper is already first child.
      const first = el.firstElementChild;
      if (first && isAlreadyDragable(first) && first.querySelector("img")) continue;

      // Strip the background-image declaration; ensure positioning context.
      let newStyle = style.replace(/background-image\s*:\s*url\([^)]*\)\s*;?/i, "").trim();
      if (!/position\s*:/i.test(newStyle)) {
        newStyle = `${newStyle}${newStyle && !newStyle.endsWith(";") ? ";" : ""}position:relative;`;
      }
      el.setAttribute("style", newStyle);

      const wrapper = doc.createElement("div");
      wrapper.className = "dragable";
      wrapper.id = newId("img");
      wrapper.setAttribute("style", "position:absolute;inset:0;z-index:0;");
      const img = doc.createElement("img");
      img.setAttribute("src", url);
      img.setAttribute("alt", "");
      img.setAttribute("style", "width:100%;height:100%;object-fit:cover;display:block;");
      wrapper.appendChild(img);
      el.insertBefore(wrapper, el.firstChild);
    }
  }
  extractBackgroundImages();

  // First pass: collect atomic + shape + svg candidates in one walk.
  // CRITICAL: when we hit an already-dragable element we still RECURSE
  // into it — only the wrap itself is skipped. Sections that arrive
  // pre-wrapped as `.dragable` (AI-generated sites, partially-migrated
  // sites) used to have their inner img/title/text left un-atomized
  // because the walker `continue`d past them entirely — the editor then
  // could select the whole section but none of its contents. Recursing
  // in fixes that; the tight-wrapper guard below prevents double-wrapping
  // atomics that are already correctly atomized.
  const atomicCandidates: Element[] = [];
  const shapeCandidates: Element[] = [];
  const svgCandidates: Element[] = [];
  function collect(node: Element): void {
    for (const child of Array.from(node.children)) {
      if (isAlreadyDragable(child)) {
        // Don't re-wrap, but descend so nested atomics get atomized.
        collect(child);
        continue;
      }
      if (isAtomicCandidate(child)) {
        // Skip if this atomic is already the sole child of a tight
        // dragable wrapper — that's the correct atomized form.
        if (isTightDragableWrapper(child.parentElement)) continue;
        atomicCandidates.push(child);
        continue;
      }
      if (isStandaloneSvg(child)) {
        if (isTightDragableWrapper(child.parentElement)) continue;
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
