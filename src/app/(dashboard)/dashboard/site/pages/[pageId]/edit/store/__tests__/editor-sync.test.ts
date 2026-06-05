/**
 * Unit tests for the store→DOM sync module. We build small HTML
 * fixtures with jsdom, run reconcile, and assert the DOM matches
 * the scene state. No React, no store — pure DOM functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { legacyHtmlToScene } from "@/lib/scene";
import {
  applyVisibilityAndLock,
  applyOrder,
  applySelection,
  pruneOrphans,
  syncStoreToDom,
} from "../editor-sync";

function container(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

const THREE_LAYERS = `<div id="a" class="dragable" style="position:absolute;left:0;top:0;width:100px;height:100px">A</div><div id="b" class="dragable" style="position:absolute;left:10px;top:10px;width:100px;height:100px">B</div><div id="c" class="dragable" style="position:absolute;left:20px;top:20px;width:100px;height:100px">C</div>`;

describe("editor-sync", () => {
  let el: HTMLElement;
  beforeEach(() => {
    el = container(THREE_LAYERS);
  });

  it("hides invisible layers via opacity + restores on re-show", () => {
    const scene = legacyHtmlToScene(THREE_LAYERS);
    // Mark B hidden
    (scene.root.children.find((l) => l.id === "b")!).visible = false;
    applyVisibilityAndLock(scene, el);
    const b = el.querySelector<HTMLElement>("#b")!;
    expect(b.style.opacity).toBe("0.3");
    expect(b.getAttribute("data-de-hidden")).toBe("1");

    // Flip back to visible
    (scene.root.children.find((l) => l.id === "b")!).visible = true;
    applyVisibilityAndLock(scene, el);
    expect(b.style.opacity).toBe("");
    expect(b.hasAttribute("data-de-hidden")).toBe(false);
  });

  it("locks layers by disabling pointer-events + restores on unlock", () => {
    const scene = legacyHtmlToScene(THREE_LAYERS);
    (scene.root.children.find((l) => l.id === "a")!).locked = true;
    applyVisibilityAndLock(scene, el);
    const a = el.querySelector<HTMLElement>("#a")!;
    expect(a.style.pointerEvents).toBe("none");
    expect(a.getAttribute("data-de-locked")).toBe("1");

    (scene.root.children.find((l) => l.id === "a")!).locked = false;
    applyVisibilityAndLock(scene, el);
    expect(a.style.pointerEvents).toBe("");
  });

  it("reorders DOM children to match scene order", () => {
    const scene = legacyHtmlToScene(THREE_LAYERS);
    // Reverse scene children: c, b, a
    scene.root.children.reverse();
    applyOrder(scene, el);
    const ids = Array.from(el.children).map((c) => c.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });

  it("prunes DOM nodes whose layer id is no longer in the scene", () => {
    const scene = legacyHtmlToScene(THREE_LAYERS);
    // Drop B from the scene
    scene.root.children = scene.root.children.filter((l) => l.id !== "b");
    pruneOrphans(scene, el);
    expect(el.querySelector("#b")).toBeNull();
    expect(el.querySelectorAll(".dragable")).toHaveLength(2);
  });

  it("applySelection adds de-selected to primary + multi, removes from others", () => {
    applySelection("a", new Set(["c"]), el);
    expect(el.querySelector("#a")!.classList.contains("de-selected")).toBe(true);
    expect(el.querySelector("#c")!.classList.contains("de-selected")).toBe(true);
    expect(el.querySelector("#b")!.classList.contains("de-selected")).toBe(false);

    applySelection(null, new Set(), el);
    expect(el.querySelectorAll(".de-selected")).toHaveLength(0);
  });

  it("syncStoreToDom runs prune + order + visibility in one pass", () => {
    const scene = legacyHtmlToScene(THREE_LAYERS);
    // Drop B, reverse, hide C
    scene.root.children = scene.root.children.filter((l) => l.id !== "b");
    scene.root.children.reverse();
    (scene.root.children.find((l) => l.id === "c")!).visible = false;
    syncStoreToDom(scene, el);
    expect(el.querySelector("#b")).toBeNull();
    expect(Array.from(el.children).map((c) => c.id)).toEqual(["c", "a"]);
    expect((el.querySelector<HTMLElement>("#c")!).style.opacity).toBe("0.3");
  });
});

describe("editor-sync: legacy image width preservation", () => {
  // A legacy designer menu-bar: a 749px-wide background image deliberately
  // overflowing a 410px .dragable container. Initial sync must NOT shrink the
  // img to fill its wrapper, or the editor diverges from the published page.
  const MENU_BAR = `<div id="bar" class="dragable" style="position:absolute;left:383px;top:34px;width:410px;height:100px"><img alt="" src="https://home.homenshop.com/konnichiwa/uploaded/files/bar-10.png" style="width: 749px; height: 112px;"></div>`;

  it("preserves authored px width on initial sync (no src swap)", () => {
    const el = container(MENU_BAR);
    const scene = legacyHtmlToScene(MENU_BAR);
    syncStoreToDom(scene, el);
    const img = el.querySelector<HTMLImageElement>("#bar img")!;
    expect(img.style.width).toBe("749px");
    expect(img.style.width).not.toBe("100%");
  });

  it("force-fills the wrapper on a genuine src swap", () => {
    const el = container(MENU_BAR);
    const scene = legacyHtmlToScene(MENU_BAR);
    const imgLayer = scene.root.children.find((l) => l.id === "bar")! as typeof scene.root.children[number] & { src?: string };
    imgLayer.src = "https://home.homenshop.com/konnichiwa/uploaded/files/new-bar.png";
    syncStoreToDom(scene, el);
    const img = el.querySelector<HTMLImageElement>("#bar img")!;
    expect(img.getAttribute("src")).toContain("new-bar.png");
    expect(img.style.width).toBe("100%");
    expect(img.style.objectFit).toBe("cover");
  });
});
