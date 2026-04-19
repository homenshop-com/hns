/**
 * Unit tests for `alignLayers`. Purely operates on scene frames — no
 * DOM. Verifies all 6 modes and that frameKeys gains the needed entries
 * so the serializer emits the new position.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store";
import type { GroupLayer, Layer } from "@/lib/scene";

function makeBox(id: string, x: number, y: number, w: number, h: number): Layer {
  return {
    id,
    name: id,
    type: "box",
    visible: true,
    locked: false,
    frame: { x, y, w, h },
    style: {},
  } as Layer;
}

function reset(children: Layer[]) {
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
        children,
        virtual: true,
      },
    },
    selectedId: null,
    multiSelectedIds: new Set(),
    dirty: false,
  });
  useEditorStore.temporal.getState().clear();
}

function root(): GroupLayer {
  return useEditorStore.getState().scene.root;
}

describe("alignLayers", () => {
  beforeEach(() => {
    reset([
      makeBox("a", 10, 10, 100, 50),
      makeBox("b", 200, 60, 80, 40),
      makeBox("c", 50, 200, 120, 60),
    ]);
  });

  it("left aligns to the minimum x", () => {
    useEditorStore.getState().alignLayers(["a", "b", "c"], "left");
    const ch = root().children;
    expect(ch.map((c) => c.frame.x)).toEqual([10, 10, 10]);
  });

  it("right aligns to the max right edge", () => {
    useEditorStore.getState().alignLayers(["a", "b", "c"], "right");
    const ch = root().children;
    // max right = 200+80 = 280. Each .x = 280 - w.
    expect(ch.find((c) => c.id === "a")!.frame.x).toBe(180);
    expect(ch.find((c) => c.id === "b")!.frame.x).toBe(200);
    expect(ch.find((c) => c.id === "c")!.frame.x).toBe(160);
  });

  it("centerH aligns midpoints to the union center", () => {
    useEditorStore.getState().alignLayers(["a", "b"], "centerH");
    const ch = root().children;
    const a = ch.find((c) => c.id === "a")!.frame;
    const b = ch.find((c) => c.id === "b")!.frame;
    // bbox x: 10..280, cx = 145
    expect(a.x + a.w / 2).toBeCloseTo(145, 0);
    expect(b.x + b.w / 2).toBeCloseTo(145, 0);
  });

  it("top aligns to the minimum y", () => {
    useEditorStore.getState().alignLayers(["a", "b", "c"], "top");
    expect(root().children.map((c) => c.frame.y)).toEqual([10, 10, 10]);
  });

  it("bottom aligns to the max bottom edge", () => {
    useEditorStore.getState().alignLayers(["a", "b", "c"], "bottom");
    // max bottom = 200+60 = 260
    const ch = root().children;
    expect(ch.find((c) => c.id === "a")!.frame.y).toBe(210);
    expect(ch.find((c) => c.id === "b")!.frame.y).toBe(220);
    expect(ch.find((c) => c.id === "c")!.frame.y).toBe(200);
  });

  it("middleV centers vertically within union", () => {
    useEditorStore.getState().alignLayers(["a", "c"], "middleV");
    const a = root().children.find((c) => c.id === "a")!.frame;
    const c = root().children.find((x) => x.id === "c")!.frame;
    // bbox y: 10..260, cy = 135
    expect(a.y + a.h / 2).toBeCloseTo(135, 0);
    expect(c.y + c.h / 2).toBeCloseTo(135, 0);
  });

  it("augments frameKeys so serializer emits left/top", () => {
    useEditorStore.getState().alignLayers(["a", "b"], "left");
    const a = root().children.find((c) => c.id === "a")!;
    expect(a.frameKeys).toContain("left");
    expect(a.frameKeys).toContain("position");
  });

  it("is a no-op with fewer than 2 layers", () => {
    const before = JSON.stringify(root().children);
    useEditorStore.getState().alignLayers(["a"], "left");
    expect(JSON.stringify(root().children)).toBe(before);
  });

  it("marks the scene dirty", () => {
    useEditorStore.getState().alignLayers(["a", "b"], "left");
    expect(useEditorStore.getState().dirty).toBe(true);
  });
});
