/**
 * mutable-baking-falcon Phase 3/4 — 3-device store routing.
 *
 * The editor store edits one of three viewports at a time
 * (desktop / tablet / mobile). Drag/resize/transform mutations must be
 * routed to the active device's override fields so each breakpoint keeps
 * an independent layout, while the desktop base stays untouched. These
 * tests pin:
 *   - setFrame in tablet mode writes tabletFrame/tabletFrameKeys
 *   - setFrame in mobile mode writes mobileFrame/mobileFrameKeys
 *   - device frames are seeded from the desktop frame on first touch
 *   - sections keep the flow-guard (width/height only) per device
 *   - setTransform routes per device
 *   - setHidden / setResponsive maintain the per-device override maps
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store";
import type { GroupLayer } from "@/lib/scene";

const HTML = [
  `<div id="abs" class="dragable" style="position:absolute;left:10px;top:20px;width:100px;height:40px">A</div>`,
  `<div id="sec" class="dragable">HERO`,
  `  <div id="sec-child" class="dragable" style="position:absolute;left:0;top:0;width:5px;height:5px"></div>`,
  `</div>`,
].join("");

function root(): GroupLayer {
  return useEditorStore.getState().scene.root;
}
function child(id: string) {
  return root().children.find((c) => c.id === id)!;
}

function reset() {
  useEditorStore.setState({
    scene: {
      version: 1,
      root: {
        id: "scene_root",
        name: "페이지",
        type: "group",
        visible: true,
        locked: false,
        frame: { x: 0, y: 0, w: 0, h: 0 },
        style: {},
        children: [],
        virtual: true,
      },
    },
    selectedId: null,
    multiSelectedIds: new Set(),
    dirty: false,
    viewportMode: "desktop",
  });
  useEditorStore.temporal.getState().clear();
  useEditorStore.getState().importHtml(HTML);
}

describe("editor-store — tablet frame routing", () => {
  beforeEach(reset);

  it("setFrame in tablet mode writes tabletFrame, leaving desktop frame intact", () => {
    const st = useEditorStore.getState();
    const before = { ...child("abs").frame };
    st.setViewportMode("tablet");
    useEditorStore.getState().setFrame("abs", { x: 5, y: 8, w: 80, h: 30 });

    const l = child("abs");
    // Desktop base untouched.
    expect(l.frame).toEqual(before);
    // Tablet override recorded.
    expect(l.tabletFrame).toEqual({ x: 5, y: 8, w: 80, h: 30 });
    expect(l.tabletFrameKeys).toEqual(
      expect.arrayContaining(["position", "left", "top", "width", "height"]),
    );
    // Mobile untouched.
    expect(l.mobileFrame).toBeUndefined();
  });

  it("seeds tabletFrame from desktop frame on first touch (only patched axis changes)", () => {
    useEditorStore.getState().setViewportMode("tablet");
    useEditorStore.getState().setFrame("abs", { x: 7 });
    const l = child("abs");
    // x updated, y/w/h inherited from desktop seed.
    expect(l.tabletFrame).toEqual({ x: 7, y: 20, w: 100, h: 40 });
  });

  it("tablet section keeps the flow-guard — width/height only, never position", () => {
    useEditorStore.getState().setViewportMode("tablet");
    useEditorStore.getState().setFrame("sec", { x: 99, y: 99, w: 700, h: 400 });
    const l = child("sec");
    expect(l.tabletFrame!.w).toBe(700);
    expect(l.tabletFrame!.h).toBe(400);
    expect(l.tabletFrameKeys ?? []).toContain("width");
    expect(l.tabletFrameKeys ?? []).toContain("height");
    expect(l.tabletFrameKeys ?? []).not.toContain("position");
    expect(l.tabletFrameKeys ?? []).not.toContain("left");
    expect(l.tabletFrameKeys ?? []).not.toContain("top");
  });

  it("seeds a tablet layout from desktop once, then preserves manual edits", () => {
    const get = () => useEditorStore.getState();
    get().seedViewportFromDesktop("tablet", 1000, 500);
    expect(child("abs").tabletFrame).toEqual({ x: 5, y: 10, w: 50, h: 20 });

    get().setViewportMode("tablet");
    get().setFrame("abs", { x: 77 });
    get().seedViewportFromDesktop("tablet", 1000, 500);

    expect(child("abs").tabletFrame).toEqual({ x: 77, y: 10, w: 50, h: 20 });
    expect(child("abs").frame).toEqual({ x: 10, y: 20, w: 100, h: 40 });
  });
});

describe("editor-store — mobile frame routing (unchanged)", () => {
  beforeEach(reset);

  it("setFrame in mobile mode writes mobileFrame, not tabletFrame", () => {
    useEditorStore.getState().setViewportMode("mobile");
    useEditorStore.getState().setFrame("abs", { x: 1, y: 2 });
    const l = child("abs");
    expect(l.mobileFrame).toEqual({ x: 1, y: 2, w: 100, h: 40 });
    expect(l.tabletFrame).toBeUndefined();
    // Desktop base untouched.
    expect(l.frame).toEqual({ x: 10, y: 20, w: 100, h: 40 });
  });
});

describe("editor-store — transform routing per device", () => {
  beforeEach(reset);

  it("routes transform to tabletTransform / mobileTransform / transform", () => {
    const get = () => useEditorStore.getState();

    get().setViewportMode("desktop");
    get().setTransform("abs", { rotate: 10 });
    expect(child("abs").transform).toEqual({ rotate: 10 });

    get().setViewportMode("tablet");
    get().setTransform("abs", { rotate: 20 });
    expect(child("abs").tabletTransform).toEqual({ rotate: 20 });
    // Desktop kept.
    expect(child("abs").transform).toEqual({ rotate: 10 });

    get().setViewportMode("mobile");
    get().setTransform("abs", { rotate: 30 });
    expect(child("abs").mobileTransform).toEqual({ rotate: 30 });
    expect(child("abs").tabletTransform).toEqual({ rotate: 20 });
  });
});

describe("editor-store — setHidden", () => {
  beforeEach(reset);

  it("sets and clears per-device hidden flags", () => {
    const get = () => useEditorStore.getState();
    get().setHidden("abs", "mobile", true);
    expect(child("abs").hidden).toEqual({ mobile: true });

    get().setHidden("abs", "tablet", true);
    expect(child("abs").hidden).toEqual({ mobile: true, tablet: true });

    get().setHidden("abs", "mobile", false);
    expect(child("abs").hidden).toEqual({ tablet: true });

    get().setHidden("abs", "tablet", false);
    // Empty map collapses to undefined.
    expect(child("abs").hidden).toBeUndefined();
  });
});

describe("editor-store — setResponsive", () => {
  beforeEach(reset);

  it("merges a partial override and clears with null / undefined keys", () => {
    const get = () => useEditorStore.getState();
    get().setResponsive("abs", "mobile", { display: "none" });
    expect(child("abs").responsive).toEqual({ mobile: { display: "none" } });

    // Merge a second key.
    get().setResponsive("abs", "mobile", { fontScale: 0.5 });
    expect(child("abs").responsive!.mobile).toEqual({
      display: "none",
      fontScale: 0.5,
    });

    // undefined removes a single key.
    get().setResponsive("abs", "mobile", { display: undefined });
    expect(child("abs").responsive!.mobile).toEqual({ fontScale: 0.5 });

    // null clears the whole device override; empty map collapses to undefined.
    get().setResponsive("abs", "mobile", null);
    expect(child("abs").responsive).toBeUndefined();
  });
});
