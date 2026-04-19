/**
 * Unit tests for the editor store. We exercise scene mutations, undo/redo
 * via zundo, and the select/group/ungroup/move actions. Pure state — no
 * DOM dependency.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store";
import type { GroupLayer } from "@/lib/scene";

const SAMPLE = `<div id="a" class="dragable" style="position: absolute; left: 0px; top: 0px; width: 100px; height: 100px">A</div><div id="b" class="dragable" style="position: absolute; left: 0px; top: 0px; width: 100px; height: 100px">B</div><div id="c" class="dragable" style="position: absolute; left: 0px; top: 0px; width: 100px; height: 100px">C</div>`;

function getRoot(): GroupLayer {
  return useEditorStore.getState().scene.root;
}

describe("editor store", () => {
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
  });

  it("imports HTML and exports it back", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    expect(getRoot().children).toHaveLength(3);
    expect(getRoot().children.map((c) => c.id)).toEqual(["a", "b", "c"]);
    const out = useEditorStore.getState().exportHtml();
    expect(out).toContain("id=\"a\"");
    expect(out).toContain("id=\"c\"");
  });

  it("importHtml does not mark the scene dirty", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  it("toggleVisibility flips the flag and marks dirty", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    useEditorStore.getState().toggleVisibility("b");
    expect(getRoot().children.find((c) => c.id === "b")?.visible).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("rename updates the layer name", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    useEditorStore.getState().rename("a", "Hero Text");
    expect(getRoot().children.find((c) => c.id === "a")?.name).toBe("Hero Text");
  });

  it("remove removes the layer and clears selection if it was selected", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    useEditorStore.getState().select("b");
    useEditorStore.getState().remove("b");
    expect(getRoot().children).toHaveLength(2);
    expect(useEditorStore.getState().selectedId).toBeNull();
  });

  it("group wraps selected siblings into a new group", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    const groupId = useEditorStore.getState().group(["a", "b"], "Group 1");
    expect(groupId).toBeTruthy();
    const root = getRoot();
    expect(root.children).toHaveLength(2); // group + c
    const group = root.children[0] as GroupLayer;
    expect(group.type).toBe("group");
    expect(group.name).toBe("Group 1");
    expect(group.children.map((c) => c.id)).toEqual(["a", "b"]);
    expect(useEditorStore.getState().selectedId).toBe(groupId);
  });

  it("ungroup inlines group children back into its parent", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    const groupId = useEditorStore.getState().group(["a", "b"]);
    expect(groupId).toBeTruthy();
    useEditorStore.getState().ungroup(groupId!);
    const root = getRoot();
    expect(root.children.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("moveLayer reorders within the same parent", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    useEditorStore.getState().moveLayer("c", "scene_root", 0);
    expect(getRoot().children.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("moveLayer rejects moving a group into its own descendant", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    const groupId = useEditorStore.getState().group(["a", "b"])!;
    useEditorStore.getState().moveLayer(groupId, "a", 0); // move group into child — must reject
    const root = getRoot();
    // Structure unchanged
    expect(root.children[0]!.id).toBe(groupId);
  });

  it("select additive toggles ids in multi-set", () => {
    useEditorStore.getState().importHtml(SAMPLE);
    const s = useEditorStore.getState();
    s.select("a");
    s.select("b", { additive: true });
    s.select("c", { additive: true });
    expect(useEditorStore.getState().selectedId).toBe("c");
    expect(Array.from(useEditorStore.getState().multiSelectedIds).sort()).toEqual(["a", "b"]);
  });
});

describe("editor store — undo/redo", () => {
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
  });

  it("undo reverts a rename", async () => {
    useEditorStore.getState().importHtml(SAMPLE);
    useEditorStore.getState().rename("a", "First");
    // zundo handleSet is debounced — wait for history commit.
    await new Promise((r) => setTimeout(r, 400));

    const hist = useEditorStore.temporal.getState();
    expect(hist.pastStates.length).toBeGreaterThan(0);

    hist.undo();
    const a = getRoot().children.find((c) => c.id === "a");
    expect(a?.name).not.toBe("First");
  });

  it("undo/redo cycle restores state", async () => {
    useEditorStore.getState().importHtml(SAMPLE);
    useEditorStore.getState().remove("b");
    await new Promise((r) => setTimeout(r, 400));
    expect(getRoot().children.map((c) => c.id)).toEqual(["a", "c"]);

    const hist = useEditorStore.temporal.getState();
    hist.undo();
    expect(getRoot().children.map((c) => c.id)).toEqual(["a", "b", "c"]);
    hist.redo();
    expect(getRoot().children.map((c) => c.id)).toEqual(["a", "c"]);
  });
});
