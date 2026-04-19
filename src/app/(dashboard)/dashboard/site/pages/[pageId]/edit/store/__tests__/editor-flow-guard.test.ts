/**
 * Sprint 9a — flow-element guard.
 *
 * A `.dragable` parsed from markup without `position`/`left`/`top` in
 * its inline style is a flow-laid-out section (e.g. `#index-hero`).
 * Mutating its frame via drag/align would cause the serializer to emit
 * `position:absolute; left; top;` on export — ripping the section out
 * of normal flow and collapsing subsequent sections on top of it.
 *
 * These tests pin the invariant: setFrame and alignLayers must be
 * no-ops on layers whose `frameKeys` doesn't include any of
 * position/left/top.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store";
import type { GroupLayer } from "@/lib/scene";

// "flow" layer: no inline position/top/left → frameKeys stays undefined.
// "abs" layer: has absolute positioning → frameKeys includes left/top.
const MIXED = [
  `<div id="flow-hero" class="dragable">HERO</div>`,
  `<div id="abs-text" class="dragable" style="position:absolute;left:10px;top:20px;width:100px;height:30px">TEXT</div>`,
].join("");

function getRoot(): GroupLayer {
  return useEditorStore.getState().scene.root;
}

function findChild(id: string) {
  return getRoot().children.find((c) => c.id === id);
}

describe("editor-store — flow-element guard", () => {
  beforeEach(() => {
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
    });
    useEditorStore.temporal.getState().clear();
    useEditorStore.getState().importHtml(MIXED);
  });

  it("parse: flow layer has undefined frameKeys; abs layer includes left/top", () => {
    const flow = findChild("flow-hero")!;
    const abs = findChild("abs-text")!;
    expect(flow.frameKeys).toBeUndefined();
    expect(abs.frameKeys).toContain("left");
    expect(abs.frameKeys).toContain("top");
  });

  it("setFrame on flow layer does NOT add position/left/top to frameKeys", () => {
    useEditorStore.getState().setFrame("flow-hero", { x: 50, y: 100 });
    const flow = findChild("flow-hero")!;
    expect(flow.frameKeys ?? []).not.toContain("position");
    expect(flow.frameKeys ?? []).not.toContain("left");
    expect(flow.frameKeys ?? []).not.toContain("top");
  });

  it("setFrame on flow layer does NOT move frame.x/y", () => {
    const before = { ...findChild("flow-hero")!.frame };
    useEditorStore.getState().setFrame("flow-hero", { x: 500, y: 500 });
    const after = findChild("flow-hero")!.frame;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it("setFrame on absolute layer DOES update frame.x/y as before", () => {
    useEditorStore.getState().setFrame("abs-text", { x: 200, y: 300 });
    const abs = findChild("abs-text")!;
    expect(abs.frame.x).toBe(200);
    expect(abs.frame.y).toBe(300);
    expect(abs.frameKeys).toContain("left");
    expect(abs.frameKeys).toContain("top");
  });

  it("setFrame width/height on flow layer is still allowed (size doesn't affect flow)", () => {
    useEditorStore.getState().setFrame("flow-hero", { w: 800, h: 400 });
    const flow = findChild("flow-hero")!;
    expect(flow.frame.w).toBe(800);
    expect(flow.frame.h).toBe(400);
    expect(flow.frameKeys ?? []).toContain("width");
    expect(flow.frameKeys ?? []).toContain("height");
    // Still must not promote to absolute.
    expect(flow.frameKeys ?? []).not.toContain("position");
  });

  it("alignLayers skips flow layers but aligns absolute siblings", () => {
    // Add a second absolute layer at a different x so align has work to do.
    useEditorStore.getState().importHtml(
      MIXED
        + `<div id="abs-text-2" class="dragable" style="position:absolute;left:400px;top:50px;width:100px;height:30px">T2</div>`,
    );
    const beforeFlow = { ...findChild("flow-hero")!.frame };

    useEditorStore.getState().alignLayers(
      ["flow-hero", "abs-text", "abs-text-2"],
      "left",
    );

    // Flow layer unchanged.
    expect(findChild("flow-hero")!.frame).toEqual(beforeFlow);
    expect(findChild("flow-hero")!.frameKeys ?? []).not.toContain("position");

    // Absolute layers aligned to the min x among the two absolutes (10).
    expect(findChild("abs-text")!.frame.x).toBe(10);
    expect(findChild("abs-text-2")!.frame.x).toBe(10);
  });
});
