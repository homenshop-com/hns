/**
 * Golden roundtrip tests for the Scene graph (parse ↔ serialize).
 *
 * Contract under test:
 *   html → legacyHtmlToScene → sceneToLegacyHtml → html'
 *   html'.normalize() === html.normalize()
 *
 * Because the legacy publisher consumes the output HTML, we must not
 * lose or reshuffle semantic content across the roundtrip. Attribute
 * order and whitespace may differ — we normalize both sides through
 * the DOM before comparing. Element tree, ids, classes, styles,
 * and inner HTML must match byte-for-byte after normalization.
 */

import { describe, it, expect } from "vitest";
import { legacyHtmlToScene } from "../parse";
import { sceneToLegacyHtml } from "../serialize";
import {
  isGroup,
  isImage,
  isPlugin,
  SceneGraph,
  GroupLayer,
} from "../types";

/* ─── Utilities ─── */

/** Normalize HTML by re-parsing and serializing via the DOM.
 *  This removes attribute-order and whitespace noise. */
function normalize(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
  return serializeDom(doc.body);
}

function serializeDom(el: Element): string {
  // Sort attributes alphabetically and normalize style by splitting on ";".
  const parts: string[] = [];
  for (let i = 0; i < el.children.length; i++) {
    parts.push(serializeNode(el.children[i]!));
  }
  // Plus any text nodes directly under body.
  let textBefore = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]!;
    if (n.nodeType === 3) textBefore += (n.textContent || "").replace(/\s+/g, " ").trim();
  }
  return (textBefore ? textBefore + "|" : "") + parts.join("");
}

function serializeNode(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    names.push(el.attributes[i]!.name);
  }
  names.sort();
  for (const n of names) {
    const v = el.getAttribute(n) ?? "";
    const norm = n === "style" ? normalizeStyle(v) : v;
    attrs.push(`${n}="${norm}"`);
  }
  let inner = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]!;
    if (c.nodeType === 1) inner += serializeNode(c as Element);
    else if (c.nodeType === 3) inner += (c.textContent || "");
  }
  return `<${tag} ${attrs.join(" ")}>${inner}</${tag}>`;
}

function normalizeStyle(v: string): string {
  const parts = v
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf(":");
      if (idx < 0) return p;
      return `${p.slice(0, idx).trim().toLowerCase()}: ${p.slice(idx + 1).trim()}`;
    });
  parts.sort();
  return parts.join("; ");
}

function roundtrip(html: string): { html: string; scene: SceneGraph } {
  const scene = legacyHtmlToScene(html);
  const out = sceneToLegacyHtml(scene);
  return { html: out, scene };
}

/* ─── Fixtures ─── */

/** Single text-only dragable. */
const FX_TEXT = `<div id="el_1_abc" class="dragable" style="position: absolute; left: 40px; top: 80px; width: 300px; height: 60px; z-index: 5">Hello <strong>world</strong></div>`;

/** Image dragable with anchor wrapper. */
const FX_IMAGE = `<div id="el_2_def" class="dragable" style="position: absolute; left: 10px; top: 20px; width: 200px; height: 150px"><a href="/about" target="_blank"><img src="/u/shop/img/hero.jpg" alt="hero"></a></div>`;

/** Plugin (board). */
const FX_BOARD = `<div id="el_3_ghi" class="dragable boardPlugin" data-board-id="notice" style="position: absolute; left: 0px; top: 0px; width: 960px; height: 400px"><div class="placeholder">board preview</div></div>`;

/** Two top-level layers. */
const FX_FLAT = FX_TEXT + FX_IMAGE + FX_BOARD;

/** Nested group (Tier-1 feature). */
const FX_GROUP = `<div id="grp_1" class="de-group dragable" style="position: absolute; left: 100px; top: 100px; width: 400px; height: 300px">${FX_TEXT}${FX_IMAGE}</div>`;

/** Deep nesting — group inside group. */
const FX_NESTED_GROUP = `<div id="grp_outer" class="de-group dragable" style="position: absolute; left: 0px; top: 0px; width: 800px; height: 600px"><div id="grp_inner" class="de-group dragable" style="position: absolute; left: 50px; top: 50px; width: 400px; height: 300px">${FX_TEXT}</div>${FX_IMAGE}</div>`;

/** Preserve custom attributes + extras like margin:auto. */
const FX_EXTRAS = `<div id="el_9_xyz" class="dragable sol-replicable-text" data-role="heading" style="position: absolute; left: 0px; top: 0px; width: 600px; height: 80px; margin: 0 auto">Centered</div>`;

/* ─── Tests ─── */

describe("roundtrip: single-layer fixtures", () => {
  it("text layer roundtrips", () => {
    const { html } = roundtrip(FX_TEXT);
    expect(normalize(html)).toBe(normalize(FX_TEXT));
  });

  it("image layer roundtrips (with anchor)", () => {
    const { html, scene } = roundtrip(FX_IMAGE);
    expect(normalize(html)).toBe(normalize(FX_IMAGE));
    // Also verify type classification.
    const child = (scene.root as GroupLayer).children[0];
    expect(child).toBeDefined();
    expect(isImage(child!)).toBe(true);
    if (isImage(child!)) {
      expect(child.src).toBe("/u/shop/img/hero.jpg");
      expect(child.href).toBe("/about");
      expect(child.hrefTarget).toBe("_blank");
    }
  });

  it("board plugin layer roundtrips and is typed as plugin", () => {
    const { html, scene } = roundtrip(FX_BOARD);
    expect(normalize(html)).toBe(normalize(FX_BOARD));
    const child = (scene.root as GroupLayer).children[0]!;
    expect(isPlugin(child)).toBe(true);
    expect(child.type).toBe("board");
    expect(child.legacyAttrs?.["data-board-id"]).toBe("notice");
  });
});

describe("roundtrip: multi-layer fixtures", () => {
  it("flat list of top-level layers preserves order", () => {
    const { html, scene } = roundtrip(FX_FLAT);
    expect(normalize(html)).toBe(normalize(FX_FLAT));
    expect((scene.root as GroupLayer).children).toHaveLength(3);
    expect((scene.root as GroupLayer).children.map((c) => c.type)).toEqual([
      "box", // FX_TEXT is classified as box (no explicit text marker); Tier-2 will promote
      "image",
      "board",
    ]);
  });

  it("single-level group roundtrips", () => {
    const { html, scene } = roundtrip(FX_GROUP);
    expect(normalize(html)).toBe(normalize(FX_GROUP));
    const root = scene.root as GroupLayer;
    expect(root.children).toHaveLength(1);
    const g = root.children[0]!;
    expect(isGroup(g)).toBe(true);
    if (isGroup(g)) expect(g.children).toHaveLength(2);
  });

  it("nested groups roundtrip", () => {
    const { html, scene } = roundtrip(FX_NESTED_GROUP);
    expect(normalize(html)).toBe(normalize(FX_NESTED_GROUP));
    const outer = (scene.root as GroupLayer).children[0]!;
    expect(isGroup(outer)).toBe(true);
    if (isGroup(outer)) {
      expect(outer.children).toHaveLength(2);
      const inner = outer.children[0]!;
      expect(isGroup(inner)).toBe(true);
      if (isGroup(inner)) expect(inner.children).toHaveLength(1);
    }
  });
});

describe("roundtrip: legacy preservation", () => {
  it("preserves custom data-* attributes and margin:auto extras", () => {
    const { html, scene } = roundtrip(FX_EXTRAS);
    expect(normalize(html)).toBe(normalize(FX_EXTRAS));
    const layer = (scene.root as GroupLayer).children[0]!;
    expect(layer.legacyAttrs?.["data-role"]).toBe("heading");
    expect(layer.legacyStyleExtras?.["margin"]).toBe("0 auto");
  });

  it("generates ids for elements missing an id", () => {
    const html = `<div class="dragable" style="position: absolute; left: 0px; top: 0px; width: 100px; height: 100px">x</div>`;
    const { scene } = roundtrip(html);
    const child = (scene.root as GroupLayer).children[0]!;
    expect(child.id).toMatch(/^el_\d+_[a-z0-9]+$/);
  });

  it("non-dragable sibling nodes at body level are dropped (known limitation)", () => {
    // Current contract: only top-level .dragable divs become layers.
    // Stray text or non-dragable siblings are not representable in the scene.
    const html = `stray text${FX_TEXT}<p>not a layer</p>`;
    const { scene } = roundtrip(html);
    expect((scene.root as GroupLayer).children).toHaveLength(1);
  });
});

describe("roundtrip: idempotence", () => {
  it("second roundtrip equals first (stable serialization)", () => {
    const a = sceneToLegacyHtml(legacyHtmlToScene(FX_FLAT));
    const b = sceneToLegacyHtml(legacyHtmlToScene(a));
    expect(a).toBe(b);
  });

  it("second roundtrip of nested groups is stable", () => {
    const a = sceneToLegacyHtml(legacyHtmlToScene(FX_NESTED_GROUP));
    const b = sceneToLegacyHtml(legacyHtmlToScene(a));
    expect(a).toBe(b);
  });
});
