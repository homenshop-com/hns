/**
 * Sprint 9b — SectionLayer parse/serialize round-trip.
 *
 * A top-level `.dragable` without inline `position`/`left`/`top` is a
 * flow section (e.g. `#index-hero`). Parser must promote it to type
 * "section" and serializer must never emit absolute positioning for it,
 * preserving its inner HTML byte-for-byte.
 */

import { describe, expect, it } from "vitest";
import { legacyHtmlToScene } from "../parse";
import { sceneToLegacyHtml } from "../serialize";
import { isSection, SectionLayer } from "../types";

describe("SectionLayer — parse", () => {
  it("promotes flow-level .dragable (no inline position) to section", () => {
    const html = `<div id="index-hero" class="dragable">HERO<div>inner</div></div>`;
    const scene = legacyHtmlToScene(html);
    const child = scene.root.children[0]!;
    expect(isSection(child)).toBe(true);
    expect(child.type).toBe("section");
    expect((child as SectionLayer).innerHtml).toContain("HERO");
    expect((child as SectionLayer).innerHtml).toContain("<div>inner</div>");
  });

  it("does NOT promote absolute-positioned .dragable to section", () => {
    const html =
      `<div id="abs" class="dragable" style="position:absolute;left:10px;top:20px;width:100px;height:30px">X</div>`;
    const scene = legacyHtmlToScene(html);
    const child = scene.root.children[0]!;
    expect(isSection(child)).toBe(false);
  });

  it("section frameKeys never contains position/left/top", () => {
    const html = `<div id="flow" class="dragable">X</div>`;
    const scene = legacyHtmlToScene(html);
    const s = scene.root.children[0] as SectionLayer;
    const keys = s.frameKeys ?? [];
    expect(keys).not.toContain("position");
    expect(keys).not.toContain("left");
    expect(keys).not.toContain("top");
  });
});

describe("SectionLayer — serialize", () => {
  it("never emits position/left/top, even if frameKeys was tampered with", () => {
    const html = `<div id="flow" class="dragable">INNER</div>`;
    const scene = legacyHtmlToScene(html);
    const s = scene.root.children[0] as SectionLayer;
    // Simulate a bug: frameKeys mutated to include position.
    s.frameKeys = ["position", "left", "top", "width", "height"];
    s.frame = { x: 999, y: 999, w: 123, h: 456 };
    const out = sceneToLegacyHtml(scene);
    expect(out).not.toMatch(/position:\s*absolute/);
    expect(out).not.toMatch(/left:\s*999/);
    expect(out).not.toMatch(/top:\s*999/);
  });

  it("round-trip preserves inner HTML verbatim", () => {
    const inner = `<h1>Hello</h1><p class="x">world</p>`;
    const html = `<div id="hero" class="dragable">${inner}</div>`;
    const scene = legacyHtmlToScene(html);
    const out = sceneToLegacyHtml(scene);
    expect(out).toContain(inner);
    expect(out).toContain(`id="hero"`);
    expect(out).toContain(`dragable`);
  });
});

/* ─── Sprint 9c — typed children inside sections ─── */

describe("SectionLayer — typed children (9c)", () => {
  it("promotes topmost .dragable descendants to typed children", () => {
    const html = `<div id="hero" class="dragable">
      <h1>Title</h1>
      <div id="cta" class="dragable" style="position:absolute;left:10px;top:20px;width:100px;height:30px">Click</div>
      <footer>bye</footer>
    </div>`;
    const scene = legacyHtmlToScene(html);
    const sec = scene.root.children[0] as SectionLayer;
    expect(sec.type).toBe("section");
    expect(sec.children).toHaveLength(1);
    expect(sec.children[0]!.id).toBe("cta");
    // Shell preserves decorative markup + has a placeholder for cta.
    expect(sec.innerHtml).toContain("<h1>Title</h1>");
    expect(sec.innerHtml).toContain("<footer>bye</footer>");
    expect(sec.innerHtml).toContain("<!--scene-child:cta-->");
    // The typed child DOM should NOT be duplicated in the shell.
    expect(sec.innerHtml).not.toContain(`id="cta"`);
  });

  it("round-trip injects children back into placeholder positions", () => {
    const html =
      `<div id="sec" class="dragable">`
      + `<h2>Hello</h2>`
      + `<div id="a" class="dragable" style="position:absolute;left:0;top:0;width:50px;height:50px">A</div>`
      + `<hr>`
      + `<div id="b" class="dragable" style="position:absolute;left:60px;top:0;width:50px;height:50px">B</div>`
      + `</div>`;
    const scene = legacyHtmlToScene(html);
    const out = sceneToLegacyHtml(scene);
    // Order preserved: h2 → a → hr → b
    const iH2 = out.indexOf("<h2>");
    const iA = out.indexOf(`id="a"`);
    const iHr = out.indexOf("<hr>");
    const iB = out.indexOf(`id="b"`);
    expect(iH2).toBeGreaterThanOrEqual(0);
    expect(iA).toBeGreaterThan(iH2);
    expect(iHr).toBeGreaterThan(iA);
    expect(iB).toBeGreaterThan(iHr);
    // No leftover placeholders in serialized output.
    expect(out).not.toContain("scene-child:");
  });

  it("deleted child: orphan placeholder is stripped on serialize", () => {
    const html =
      `<div id="sec" class="dragable">`
      + `<div id="keep" class="dragable" style="position:absolute;left:0;top:0;width:10px;height:10px">K</div>`
      + `<div id="drop" class="dragable" style="position:absolute;left:20px;top:0;width:10px;height:10px">D</div>`
      + `</div>`;
    const scene = legacyHtmlToScene(html);
    const sec = scene.root.children[0] as SectionLayer;
    // Simulate editor remove(): drop the second child from the array.
    sec.children = sec.children.filter((c) => c.id !== "drop");
    const out = sceneToLegacyHtml(scene);
    expect(out).toContain(`id="keep"`);
    expect(out).not.toContain(`id="drop"`);
    expect(out).not.toContain("scene-child:");
  });

  it("recursively promotes nested sections (section-in-section)", () => {
    const html =
      `<div id="outer" class="dragable">`
      + `<div id="inner" class="dragable">`  // no inline abs — also section
      + `<div id="leaf" class="dragable" style="position:absolute;left:0;top:0;width:10px;height:10px">L</div>`
      + `</div>`
      + `</div>`;
    const scene = legacyHtmlToScene(html);
    const outer = scene.root.children[0] as SectionLayer;
    expect(outer.type).toBe("section");
    expect(outer.children).toHaveLength(1);
    const inner = outer.children[0] as SectionLayer;
    expect(inner.type).toBe("section");
    expect(inner.children).toHaveLength(1);
    expect(inner.children[0]!.id).toBe("leaf");
  });
});
