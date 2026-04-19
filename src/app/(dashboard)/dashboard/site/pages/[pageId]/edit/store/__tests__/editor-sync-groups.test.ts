/**
 * Tier-2 structural sync tests: group wrapper creation on group(), and
 * unwrapping on ungroup(). Transforms pushed to DOM styles.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { legacyHtmlToScene } from "@/lib/scene";
import { syncStoreToDom, applyStructure } from "../editor-sync";
import type { SceneGraph, GroupLayer } from "@/lib/scene";

const THREE = `<div id="a" class="dragable" style="position:absolute;left:0;top:0;width:100px;height:100px">A</div><div id="b" class="dragable" style="position:absolute;left:10px;top:10px;width:100px;height:100px">B</div><div id="c" class="dragable" style="position:absolute;left:20px;top:20px;width:100px;height:100px">C</div>`;

function asHost(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("applyStructure — grouping & ungrouping", () => {
  let host: HTMLElement;
  let scene: SceneGraph;
  beforeEach(() => {
    host = asHost(THREE);
    scene = legacyHtmlToScene(THREE);
  });

  it("wraps children into a real .de-group.dragable element on group()", () => {
    // Simulate the store's group() result: replace [A,B,C] with [Group{A,B}, C]
    const group: GroupLayer = {
      id: "grp1",
      name: "그룹",
      type: "group",
      visible: true,
      locked: false,
      frame: { x: 0, y: 0, w: 0, h: 0 },
      style: {},
      children: [scene.root.children[0]!, scene.root.children[1]!],
    };
    scene.root.children = [group, scene.root.children[2]!];
    syncStoreToDom(scene, host);

    const wrapper = host.querySelector<HTMLElement>("#grp1");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.classList.contains("de-group")).toBe(true);
    expect(wrapper!.classList.contains("dragable")).toBe(true);
    // A and B moved inside; C stays outside.
    expect(wrapper!.querySelector("#a")).not.toBeNull();
    expect(wrapper!.querySelector("#b")).not.toBeNull();
    expect(host.querySelector(":scope > #c")).not.toBeNull();
    expect(host.querySelector(":scope > #a")).toBeNull();
  });

  it("unwraps children on ungroup (group removed from scene)", () => {
    // First group A,B
    const group: GroupLayer = {
      id: "grp1", name: "그룹", type: "group", visible: true, locked: false,
      frame: { x: 0, y: 0, w: 0, h: 0 }, style: {},
      children: [scene.root.children[0]!, scene.root.children[1]!],
    };
    scene.root.children = [group, scene.root.children[2]!];
    syncStoreToDom(scene, host);
    expect(host.querySelector("#grp1")).not.toBeNull();

    // Now ungroup: scene has A, B, C flat again; group removed.
    scene.root.children = [...group.children, scene.root.children[1]!];
    syncStoreToDom(scene, host);
    expect(host.querySelector("#grp1")).toBeNull(); // wrapper pruned
    expect(host.querySelector("#a")).not.toBeNull();
    expect(host.querySelector("#b")).not.toBeNull();
  });

  it("pushes layer.frame (left/top/width/height) into the DOM style", () => {
    // Force frameKeys so the sync knows to emit all 4.
    const a = scene.root.children[0]!;
    a.frame = { x: 77, y: 88, w: 222, h: 111 };
    a.frameKeys = ["position", "left", "top", "width", "height"];
    applyStructure(scene, host);
    const el = host.querySelector<HTMLElement>("#a")!;
    expect(el.style.left).toBe("77px");
    expect(el.style.top).toBe("88px");
    expect(el.style.width).toBe("222px");
    expect(el.style.height).toBe("111px");
  });

  it("pushes layer.transform into the DOM element's style", () => {
    scene.root.children[0]!.transform = { rotate: 30 };
    applyStructure(scene, host);
    const a = host.querySelector<HTMLElement>("#a")!;
    expect(a.style.transform).toContain("rotate(30deg)");
  });

  it("clears DOM transform when layer.transform reset to undefined", () => {
    scene.root.children[0]!.transform = { rotate: 30 };
    applyStructure(scene, host);
    const a = host.querySelector<HTMLElement>("#a")!;
    expect(a.style.transform).toContain("rotate(30deg)");
    scene.root.children[0]!.transform = undefined;
    applyStructure(scene, host);
    expect(a.style.transform).toBe("");
  });
});
