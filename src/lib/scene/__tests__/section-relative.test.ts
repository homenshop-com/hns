/**
 * Regression — a .dragable wrapper carrying inline `position: relative`
 * (a common pattern for hero/banner sections that establish a
 * positioning context for absolute-positioned chips inside them) must
 * still be classified as a SectionLayer.
 *
 * The 2026-04-22 bug: parser rejected any element with inline `position`
 * from section-hood, so the outer hero dragable became a BoxLayer. The
 * editor-sync layer then force-wrote `position: absolute` on it via
 * applyFrameToEl, taking it out of flow. The hero's min-height: 560px
 * was lost and the whole section collapsed visually — Plus Academy
 * storage site rendered with only the hero eyebrow wrapped character-
 * by-character and the rest of the hero content missing.
 *
 * Fix: isFlowSection rejects only `position: absolute | fixed` and
 * explicit left/top coords. `position: relative` is fine for sections.
 */

import { describe, it, expect } from "vitest";
import { legacyHtmlToScene } from "../parse";
import { sceneToLegacyHtml } from "../serialize";
import { isSection } from "../types";

describe("SectionLayer detection — position:relative is allowed", () => {
  it("classifies a flow dragable with inline `position: relative` as a section", () => {
    const html = `<div class="dragable" id="hero_sec" style="position: relative;">
  <section class="pa-hero">
    <div class="dragable sol-replacible-text" id="title_1"><h1>한 달 만에</h1></div>
    <div class="dragable" id="img_1"><img src="a.jpg" /></div>
  </section>
</div>`;
    const scene = legacyHtmlToScene(html);
    const root = scene.root;
    expect(root.children).toHaveLength(1);
    const hero = root.children[0]!;
    expect(hero.id).toBe("hero_sec");
    expect(isSection(hero)).toBe(true);
  });

  it("still rejects position: absolute for section detection", () => {
    const html = `<div class="dragable" id="floating" style="position: absolute; left: 10px; top: 20px;">
  <div class="dragable" id="inner"><span>x</span></div>
</div>`;
    const scene = legacyHtmlToScene(html);
    const hero = scene.root.children[0]!;
    expect(isSection(hero)).toBe(false); // absolute → atomic/box, not section
  });

  it("still rejects position: fixed for section detection", () => {
    const html = `<div class="dragable" id="sticky" style="position: fixed;">
  <div class="dragable" id="inner">x</div>
</div>`;
    const scene = legacyHtmlToScene(html);
    expect(isSection(scene.root.children[0]!)).toBe(false);
  });

  it("rejects sections with inline left/top coords even if position is relative", () => {
    // left/top aren't meaningful on a relative-positioned element without
    // explicit intent — treat as atomic to preserve user's manual coords.
    const html = `<div class="dragable" id="nudged" style="position: relative; left: 50px;">
  <div class="dragable" id="inner">x</div>
</div>`;
    const scene = legacyHtmlToScene(html);
    expect(isSection(scene.root.children[0]!)).toBe(false);
  });

  it("strips inline position on re-serialize so repeated saves stay clean", () => {
    const html = `<div class="dragable" id="hero_sec" style="position: relative;">
  <div class="dragable" id="child_1"><h1>hi</h1></div>
</div>`;
    const scene = legacyHtmlToScene(html);
    const hero = scene.root.children[0]!;
    expect(isSection(hero)).toBe(true);
    const out = sceneToLegacyHtml(scene);
    // Sections serialize without position/left/top inline style — the
    // wrapper is flow-positioned by the template CSS (.pa-hero{position:relative}).
    // This keeps repeated save → reload cycles from drifting.
    expect(out).not.toMatch(/id="hero_sec"[^>]*style="[^"]*position/i);
  });
});
