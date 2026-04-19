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
