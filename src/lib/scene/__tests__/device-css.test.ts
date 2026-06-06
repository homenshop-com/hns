/**
 * buildDeviceMediaCss — single-source device `@media` emitter
 * (mutable-baking-falcon Phase 3/4 WYSIWYG core).
 *
 * Both the editor preview and the published route call this one function,
 * so these tests pin the exact CSS it produces for each override family:
 *   - absolute device frames (tabletFrame@1024 / mobileFrame@767)
 *   - flow cascade overrides (responsive.tablet / responsive.mobile)
 *   - per-device visibility (hidden.tablet / hidden.mobile)
 * plus the section flow-guard and the idempotent strip helper.
 */

import { describe, expect, it } from "vitest";
import { legacyHtmlToScene } from "../parse";
import {
  buildDeviceMediaCss,
  stripDeviceMediaCss,
  DEVICE_MEDIA_COMMENT_MARK,
} from "../device-css";

function sceneOf(html: string) {
  return legacyHtmlToScene(html);
}

describe("buildDeviceMediaCss — absolute device frames", () => {
  it("emits a tablet @media(max-width:1024px) block from tabletFrame", () => {
    const scene = sceneOf(
      '<div class="dragable" id="a" style="position:absolute;left:10px;top:20px;width:100px;height:40px">x</div>',
    );
    const layer = scene.root.children[0]!;
    layer.tabletFrame = { x: 5, y: 8, w: 80, h: 30 };
    layer.tabletFrameKeys = ["position", "left", "top", "width", "height"];

    const css = buildDeviceMediaCss(scene);
    expect(css).toContain("@media (max-width: 1024px) {");
    expect(css).toContain("#a {");
    expect(css).toContain("position: absolute !important;");
    expect(css).toContain("left: 5px !important;");
    expect(css).toContain("top: 8px !important;");
    expect(css).toContain("width: 80px !important;");
    expect(css).toContain("height: 30px !important;");
  });

  it("emits a mobile @media(max-width:767px) block from mobileFrame", () => {
    const scene = sceneOf(
      '<div class="dragable" id="a" style="position:absolute;left:10px;top:20px;width:100px;height:40px">x</div>',
    );
    const layer = scene.root.children[0]!;
    layer.mobileFrame = { x: 0, y: 0, w: 320, h: 50 };
    layer.mobileFrameKeys = ["left", "top", "width"];

    const css = buildDeviceMediaCss(scene);
    expect(css).toContain("@media (max-width: 767px) {");
    expect(css).toContain("left: 0px !important;");
    expect(css).toContain("top: 0px !important;");
    expect(css).toContain("width: 320px !important;");
    // height key was not in mobileFrameKeys → not emitted.
    expect(css).not.toContain("height: 50px");
  });

  it("orders tablet block before mobile block (mobile wins the cascade)", () => {
    const scene = sceneOf(
      '<div class="dragable" id="a" style="position:absolute;left:0;top:0;width:10px;height:10px">x</div>',
    );
    const layer = scene.root.children[0]!;
    layer.tabletFrame = { x: 1, y: 1, w: 1, h: 1 };
    layer.tabletFrameKeys = ["width"];
    layer.mobileFrame = { x: 2, y: 2, w: 2, h: 2 };
    layer.mobileFrameKeys = ["width"];

    const css = buildDeviceMediaCss(scene);
    const tabletIdx = css.indexOf("max-width: 1024px");
    const mobileIdx = css.indexOf("max-width: 767px");
    expect(tabletIdx).toBeGreaterThan(-1);
    expect(mobileIdx).toBeGreaterThan(tabletIdx);
  });

  it("applies the section flow-guard — width/height only, never position/left/top", () => {
    // A flow section: top-level dragable with a dragable child, no inline position.
    const scene = sceneOf(
      '<div class="dragable" id="hero">HERO' +
        '<div class="dragable" id="c1" style="position:absolute;left:0;top:0;width:5px;height:5px">y</div>' +
        "</div>",
    );
    const section = scene.root.children[0]!;
    expect(section.type).toBe("section");
    section.tabletFrame = { x: 9, y: 9, w: 700, h: 400 };
    section.tabletFrameKeys = ["position", "left", "top", "width", "height"];

    const css = buildDeviceMediaCss(scene);
    expect(css).toContain("width: 700px !important;");
    expect(css).toContain("height: 400px !important;");
    // Flow guard: section never gets re-pinned.
    expect(css).not.toContain("left: 9px");
    expect(css).not.toContain("top: 9px");
    expect(css).not.toMatch(/#hero \{[^}]*position: absolute/);
  });
});

describe("buildDeviceMediaCss — flow cascade overrides", () => {
  it("emits display / padding / text-align / flex-direction from ResponsiveOverride", () => {
    const scene = sceneOf('<div class="dragable" id="sec">s</div>');
    const layer = scene.root.children[0]!;
    layer.responsive = {
      mobile: {
        display: "flex",
        padding: "8px 16px",
        align: "center",
        flexDirection: "column",
      },
    };

    const css = buildDeviceMediaCss(scene);
    expect(css).toContain("@media (max-width: 767px) {");
    expect(css).toContain("display: flex !important;");
    expect(css).toContain("padding: 8px 16px !important;");
    expect(css).toContain("text-align: center !important;");
    expect(css).toContain("flex-direction: column !important;");
  });

  it("scales font-size by fontScale relative to the layer's base font-size", () => {
    const scene = sceneOf('<div class="dragable" id="h">Heading</div>');
    const layer = scene.root.children[0]!;
    layer.style.fontSize = "40px";
    layer.responsive = { mobile: { fontScale: 0.6 } };

    const css = buildDeviceMediaCss(scene);
    // 40 * 0.6 = 24
    expect(css).toContain("font-size: 24px !important;");
  });

  it("skips fontScale when the layer has no base font-size to scale", () => {
    const scene = sceneOf('<div class="dragable" id="h">Heading</div>');
    const layer = scene.root.children[0]!;
    layer.responsive = { mobile: { fontScale: 0.6 } };

    const css = buildDeviceMediaCss(scene);
    expect(css).not.toContain("font-size");
  });
});

describe("buildDeviceMediaCss — visibility", () => {
  it("emits display:none for hidden devices and skips geometry for them", () => {
    const scene = sceneOf(
      '<div class="dragable" id="a" style="position:absolute;left:0;top:0;width:10px;height:10px">x</div>',
    );
    const layer = scene.root.children[0]!;
    layer.hidden = { mobile: true };
    // Even if a mobileFrame is present, a hidden layer emits only display:none.
    layer.mobileFrame = { x: 1, y: 1, w: 1, h: 1 };
    layer.mobileFrameKeys = ["width"];

    const css = buildDeviceMediaCss(scene);
    expect(css).toContain("@media (max-width: 767px) {");
    expect(css).toMatch(/#a \{ display: none !important; \}/);
    expect(css).not.toContain("width: 1px");
  });
});

describe("buildDeviceMediaCss — empty", () => {
  it("returns empty string when no layer has any device override", () => {
    const scene = sceneOf('<div class="dragable" id="a">x</div>');
    expect(buildDeviceMediaCss(scene)).toBe("");
  });
});

describe("stripDeviceMediaCss — idempotent replace", () => {
  it("round-trips: strip(base + build) === base", () => {
    const base = "#hns_body{color:#111}\n.foo{margin:0}";
    const scene = sceneOf('<div class="dragable" id="a">x</div>');
    const layer = scene.root.children[0]!;
    layer.responsive = { mobile: { display: "none" } };

    const block = buildDeviceMediaCss(scene);
    expect(block).toContain(DEVICE_MEDIA_COMMENT_MARK);

    const combined = base + "\n" + block;
    const stripped = stripDeviceMediaCss(combined);
    expect(stripped).toBe(base);
    // Stripping again is a no-op.
    expect(stripDeviceMediaCss(stripped)).toBe(base);
  });

  it("removes both tablet and mobile blocks", () => {
    const scene = sceneOf('<div class="dragable" id="a">x</div>');
    const layer = scene.root.children[0]!;
    layer.responsive = {
      tablet: { display: "none" },
      mobile: { display: "block" },
    };
    const block = buildDeviceMediaCss(scene);
    const combined = "#base{}\n" + block;
    expect(stripDeviceMediaCss(combined)).toBe("#base{}");
  });

  it("leaves CSS without the marker untouched", () => {
    const css = "#a{color:red}\n@media (max-width: 600px){#a{color:blue}}";
    expect(stripDeviceMediaCss(css)).toBe(css);
  });
});
