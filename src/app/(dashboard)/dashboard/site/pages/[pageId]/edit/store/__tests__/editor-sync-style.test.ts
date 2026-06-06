/**
 * Sprint 9k-fix (2026-04-22) — applyStructure must mirror LayerStyle
 * tokens (typography / fill / border / effect) onto the canvas DOM, and
 * scrub matching inheritable declarations from descendants so the
 * outer wrapper's value wins the cascade.
 *
 * Bug this test catches:
 *   <div class="dragable" id="p1">
 *     <p style="color:#555">Body copy…</p>     <!-- inner wins -->
 *   </div>
 * User edits 글자색 in the Inspector → setStyle sets layer.style.color
 * on #p1. Pre-fix: applyStructure only applied frame+transform, so the
 * new color never hit the DOM. Post-fix: the outer div gets the color
 * inline AND the inner <p>'s `color:#555` declaration is scrubbed.
 */

import { describe, it, expect } from "vitest";
import { legacyHtmlToScene } from "@/lib/scene";
import { syncStoreToDom } from "../editor-sync";

function hostOf(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("applyStructure — LayerStyle → DOM", () => {
  it("writes typography tokens from layer.style to the outer dragable's inline style", () => {
    const host = hostOf(
      '<div class="dragable sol-replacible-text" id="p1"><p style="margin:0">Body copy</p></div>',
    );
    const scene = legacyHtmlToScene(host.innerHTML);
    // Simulate Inspector setting 글자색 + 폰트크기.
    const layer = scene.root.children[0]!;
    layer.style.color = "#BF1D1D";
    layer.style.fontSize = "20px";
    // Reset the DOM to the raw HTML (new scene + fresh host).
    const freshHost = hostOf(
      '<div class="dragable sol-replacible-text" id="p1"><p style="margin:0">Body copy</p></div>',
    );
    syncStoreToDom(scene, freshHost);

    const outer = freshHost.querySelector("#p1") as HTMLElement;
    expect(outer.style.color).toBe("rgb(191, 29, 29)");
    expect(outer.style.fontSize).toBe("20px");
  });

  it("makes the outer wrapper's typography win over a conflicting descendant declaration", () => {
    // Spec note: the wrapper's value is propagated onto text descendants as
    // `!important` (not merely scrubbed). This is stronger than scrubbing —
    // it beats AI-generated class rules like `.hero h1 { color:#fff }` that a
    // bare wrapper color could never override via inheritance.
    const host = hostOf(
      '<div class="dragable sol-replacible-text" id="p1"><p style="color:#555;margin:0">Body copy</p></div>',
    );
    const scene = legacyHtmlToScene(host.innerHTML);
    const layer = scene.root.children[0]!;
    layer.style.color = "#BF1D1D";
    const freshHost = hostOf(
      '<div class="dragable sol-replacible-text" id="p1"><p style="color:#555;margin:0">Body copy</p></div>',
    );
    syncStoreToDom(scene, freshHost);

    const innerP = freshHost.querySelector("#p1 p") as HTMLElement;
    // The descendant's stale #555 is gone; the wrapper's color is pushed
    // down as an !important declaration so it wins the cascade.
    expect(innerP.style.getPropertyValue("color")).toBe("rgb(191, 29, 29)");
    expect(innerP.style.getPropertyPriority("color")).toBe("important");
    // Non-typography declarations (margin) must be preserved.
    expect(innerP.getAttribute("style") ?? "").toMatch(/margin/i);
  });

  it("leaves descendants alone when the layer has no typography tokens set", () => {
    const host = hostOf(
      '<div class="dragable" id="p1"><p style="color:#555">Body copy</p></div>',
    );
    const scene = legacyHtmlToScene(host.innerHTML);
    // No setStyle call — layer.style.color is whatever the parser extracted
    // from the outer div (nothing, in this case).
    const freshHost = hostOf(
      '<div class="dragable" id="p1"><p style="color:#555">Body copy</p></div>',
    );
    syncStoreToDom(scene, freshHost);

    const innerP = freshHost.querySelector("#p1 p") as HTMLElement;
    expect(innerP.getAttribute("style")).toMatch(/color\s*:\s*#555/i);
  });

  it("applies fill/border/effect tokens to the outer element", () => {
    const host = hostOf(
      '<div class="dragable" id="box1">a</div>',
    );
    const scene = legacyHtmlToScene(host.innerHTML);
    const layer = scene.root.children[0]!;
    layer.style.background = "#101820";
    layer.style.borderRadius = "12px";
    layer.style.boxShadow = "0 4px 10px rgba(0,0,0,.25)";
    const freshHost = hostOf('<div class="dragable" id="box1">a</div>');
    syncStoreToDom(scene, freshHost);

    const outer = freshHost.querySelector("#box1") as HTMLElement;
    // jsdom normalizes colors/values; check via the style attribute.
    const styleAttr = outer.getAttribute("style") ?? "";
    expect(styleAttr).toMatch(/background/i);
    expect(outer.style.borderRadius).toBe("12px");
    expect(outer.style.boxShadow).toContain("rgba(0,0,0,.25)");
  });

  it("removes a previously set inline style when the token is cleared to undefined", () => {
    const host = hostOf(
      '<div class="dragable" id="p1" style="color:#333">Hi</div>',
    );
    const scene = legacyHtmlToScene(host.innerHTML);
    const layer = scene.root.children[0]!;
    expect(layer.style.color).toBe("#333");
    // User clears the Inspector color field → setStyle drops the key.
    delete layer.style.color;
    const freshHost = hostOf(
      '<div class="dragable" id="p1" style="color:#333">Hi</div>',
    );
    syncStoreToDom(scene, freshHost);

    const outer = freshHost.querySelector("#p1") as HTMLElement;
    expect(outer.style.color).toBe("");
  });
});
