/**
 * Scene-owned base-level geometry stripping (mutable-baking-falcon —
 * body object drag/resize). These pin the shared single source used by
 * BOTH the editor canvas and the published route, so the boosted page-CSS
 * `#id{left:..!important}` duplicate can't beat the scene's plain inline.
 */

import { describe, expect, it } from "vitest";
import {
  SCENE_GEOMETRY_PROPS,
  stripPinnedGeometryCss,
  collectInlineGeometryOwners,
  collectSceneGeometryOwners,
  stripInlineGeometryImportant,
} from "../geometry-strip";

describe("stripPinnedGeometryCss", () => {
  it("returns css unchanged when nothing is owned", () => {
    const css = "#a{left:10px;top:20px}";
    expect(stripPinnedGeometryCss(css, new Map())).toBe(css);
  });

  it("returns css unchanged when empty", () => {
    expect(stripPinnedGeometryCss("", new Map([["a", new Set(["left"])]]))).toBe("");
  });

  it("strips only the owned geometry prop from a base-level id rule", () => {
    const css = "#a{left:10px;top:20px;color:red}";
    const owned = new Map([["a", new Set(["left", "top"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe("#a{color:red}");
  });

  it("keeps non-owned geometry props for the same id", () => {
    const css = "#a{left:10px;width:200px;height:50px}";
    const owned = new Map([["a", new Set(["left"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe("#a{width:200px;height:50px}");
  });

  it("drops a rule that is emptied entirely", () => {
    const css = "#a{left:10px;top:20px}#b{color:blue}";
    const owned = new Map([["a", new Set(["left", "top"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe("#b{color:blue}");
  });

  it("leaves @media blocks verbatim (per-device overrides survive)", () => {
    const css =
      "#a{left:10px}@media (max-width:768px){#a{left:5px !important}}";
    const owned = new Map([["a", new Set(["left"])]]);
    // base-level left stripped → rule emptied → dropped; @media kept verbatim
    expect(stripPinnedGeometryCss(css, owned)).toBe(
      "@media (max-width:768px){#a{left:5px !important}}",
    );
  });

  it("handles nested @media braces without over-consuming", () => {
    const css =
      "#a{top:1px}@media screen{@supports (x:y){#a{top:2px}}}#a{color:red}";
    const owned = new Map([["a", new Set(["top"])]]);
    const out = stripPinnedGeometryCss(css, owned);
    // base #a{top} stripped (rule emptied → dropped), nested at-rule verbatim,
    // trailing #a{color} kept (no owned prop)
    expect(out).toBe(
      "@media screen{@supports (x:y){#a{top:2px}}}#a{color:red}",
    );
  });

  it("does not touch ids the scene does not own", () => {
    const css = "#a{left:10px}#b{left:99px}";
    const owned = new Map([["a", new Set(["left"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe("#b{left:99px}");
  });

  it("ignores compound/class selectors (only bare #id matches)", () => {
    const css = "#a .child{left:10px}";
    const owned = new Map([["a", new Set(["left"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe(css);
  });

  it("matches prop case-insensitively", () => {
    const css = "#a{LEFT:10px;Top:5px}";
    const owned = new Map([["a", new Set(["left", "top"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe("");
  });

  it("strips even when a CSS comment precedes the selector", () => {
    // Regression: route emits `/* layout fix */\n#id {…}` — the comment must
    // not defeat the `^#id$` match (konnichiwa main_text_1 bug).
    const css =
      "/* layout (style-index.html.css) */\n#main_text_1 {width: 614px !important; left: 480px !important; color: red}";
    const owned = new Map([["main_text_1", new Set(["width", "left"])]]);
    // geometry stripped, non-geometry (color) kept, comment preserved
    expect(stripPinnedGeometryCss(css, owned)).toBe(
      "/* layout (style-index.html.css) */\n#main_text_1 { color: red}",
    );
  });

  it("drops a comment-preceded rule that is fully emptied", () => {
    // The emptied rule's whole selector slice (comment included) is dropped.
    const css = "/* fix */ #a {left:1px;top:2px}#b{color:blue}";
    const owned = new Map([["a", new Set(["left", "top"])]]);
    expect(stripPinnedGeometryCss(css, owned)).toBe("#b{color:blue}");
  });
});

describe("collectInlineGeometryOwners", () => {
  it("collects geometry props declared inline per id", () => {
    const html = `<div id="a" style="left:10px;top:20px;color:red"></div>`;
    const map = collectInlineGeometryOwners(html);
    expect(map.get("a")).toEqual(new Set(["left", "top"]));
  });

  it("ignores tags without id or without style", () => {
    const html = `<div style="left:1px"></div><span id="b"></span>`;
    expect(collectInlineGeometryOwners(html).size).toBe(0);
  });

  it("only records the geometry subset, not arbitrary props", () => {
    const html = `<div id="a" style="color:red;margin:0;width:5px"></div>`;
    expect(collectInlineGeometryOwners(html).get("a")).toEqual(new Set(["width"]));
  });

  it("returns empty map for empty html", () => {
    expect(collectInlineGeometryOwners("").size).toBe(0);
  });

  it("excludes dynamic plugin elements (boardPlugin) — placeholder inline size", () => {
    // Regression: konnichiwa hero v_home_dft_new_component_1740 is a
    // boardPlugin with inline 200×50 placeholder; real size is in CSS.
    const html =
      `<div id="hero" class="dragable boardPlugin" style="width:200px;height:50px;left:0px;top:130px"></div>`;
    expect(collectInlineGeometryOwners(html).size).toBe(0);
  });

  it("excludes productPlugin / exhibitionPlugin / menuPlugin too", () => {
    for (const cls of ["productPlugin", "exhibitionPlugin", "menuPlugin", "loginPlugin", "mailPlugin"]) {
      const html = `<div id="x" class="dragable ${cls}" style="width:200px;left:0px"></div>`;
      expect(collectInlineGeometryOwners(html).size).toBe(0);
    }
  });

  it("still owns regular (non-plugin) elements", () => {
    const html = `<div id="t" class="dragable sol-replacible-text" style="left:10px;top:20px"></div>`;
    expect(collectInlineGeometryOwners(html).get("t")).toEqual(new Set(["left", "top"]));
  });

  it("z-index inline does not register as a geometry owner", () => {
    const html = `<div id="a" style="z-index:5"></div>`;
    expect(collectInlineGeometryOwners(html).size).toBe(0);
  });
});

describe("collectSceneGeometryOwners", () => {
  it("collects frameKeys ∩ geometry props, walking children", () => {
    const root = {
      id: "root",
      children: [
        { id: "a", frameKeys: ["left", "top", "width"] },
        {
          id: "g",
          frameKeys: ["position"],
          children: [{ id: "c", frameKeys: ["height"] }],
        },
      ],
    };
    const map = collectSceneGeometryOwners(root);
    expect(map.get("a")).toEqual(new Set(["left", "top", "width"]));
    expect(map.get("g")).toEqual(new Set(["position"]));
    expect(map.get("c")).toEqual(new Set(["height"]));
  });

  it("skips layers with no frameKeys", () => {
    const root = { id: "root", children: [{ id: "a" }] };
    expect(collectSceneGeometryOwners(root).size).toBe(0);
  });

  it("ignores non-geometry frameKeys", () => {
    const root = {
      id: "root",
      children: [{ id: "a", frameKeys: ["left", "opacity" as never] }],
    };
    expect(collectSceneGeometryOwners(root).get("a")).toEqual(new Set(["left"]));
  });

  it("excludes plugin-type layers (board/product/exhibition/menu/login/mail)", () => {
    const root = {
      id: "root",
      children: [
        { id: "hero", type: "board", frameKeys: ["left", "top", "width", "height"] },
        { id: "grid", type: "product", frameKeys: ["width", "height"] },
        { id: "txt", type: "text", frameKeys: ["left", "top"] },
      ],
    };
    const map = collectSceneGeometryOwners(root);
    expect(map.has("hero")).toBe(false);
    expect(map.has("grid")).toBe(false);
    expect(map.get("txt")).toEqual(new Set(["left", "top"]));
  });
});

describe("stripInlineGeometryImportant", () => {
  it("removes !important from inline geometry props, keeping the value", () => {
    const html = `<div id="a" style="position: absolute; width: 354px !important; top: 157px !important; left: 23px !important; height: 67px !important;"></div>`;
    expect(stripInlineGeometryImportant(html)).toBe(
      `<div id="a" style="position: absolute; width: 354px; top: 157px; left: 23px; height: 67px;"></div>`,
    );
  });

  it("preserves !important on non-geometry props (background, font-size, text-align)", () => {
    const html = `<div style="left: 10px !important; background: #fff !important; font-size: 40px !important; text-align: center !important;"></div>`;
    expect(stripInlineGeometryImportant(html)).toBe(
      `<div style="left: 10px; background: #fff !important; font-size: 40px !important; text-align: center !important;"></div>`,
    );
  });

  it("does not touch min-height / max-width (hyphenated props)", () => {
    const html = `<div style="min-height: 100px !important; max-width: 200px !important;"></div>`;
    expect(stripInlineGeometryImportant(html)).toBe(html);
  });

  it("never matches geometry inside <style> blocks (device @media stays !important)", () => {
    const html = `<style>@media (max-width:1024px){#x{left:10px !important;top:5px !important}}</style>`;
    expect(stripInlineGeometryImportant(html)).toBe(html);
  });

  it("is a no-op when there is no !important", () => {
    const html = `<div style="left: 10px; top: 5px;"></div>`;
    expect(stripInlineGeometryImportant(html)).toBe(html);
  });
});

describe("SCENE_GEOMETRY_PROPS", () => {
  it("is the canonical geometry prop list", () => {
    expect([...SCENE_GEOMETRY_PROPS]).toEqual([
      "position",
      "left",
      "top",
      "width",
      "height",
    ]);
  });
});
