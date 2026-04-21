/**
 * Sprint 9h regression test — applyStructure must preserve the decorative
 * wrappers inside a section's innerHtml. If we reparent section children
 * directly under the section element, we destroy the CSS grid/flex those
 * wrappers provide (.split-sec, .stats-inner, .features-grid, etc.).
 *
 * Bug this test catches:
 * - AI generates a section with CSS grid on an inner wrapper:
 *     <div class="dragable" id="sec">
 *       <div class="split-sec">              <!-- grid 1fr 1fr -->
 *         <div class="dragable" id="img">…</div>
 *         <div class="dragable de-group" id="content">…</div>
 *       </div>
 *     </div>
 * - Pre-fix applyStructure moved #img and #content directly under #sec,
 *   bypassing .split-sec → stacked layout instead of side-by-side.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { legacyHtmlToScene } from "@/lib/scene";
import { syncStoreToDom } from "../editor-sync";
import type { SceneGraph } from "@/lib/scene";

function asHost(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("applyStructure — section decorative wrappers are preserved", () => {
  it("keeps atomic children inside a .split-sec grid wrapper", () => {
    const html = [
      '<div class="dragable" id="sec_why">',
      '  <div class="split-sec" id="split_wrap">',
      '    <div class="dragable" id="img_why"><img src="x.jpg" alt="x"/></div>',
      '    <div class="dragable de-group" id="content_why">',
      '      <div class="dragable sol-replacible-text" id="title_why"><h2>T</h2></div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join("");
    const host = asHost(html);
    const scene: SceneGraph = legacyHtmlToScene(html);

    // Sanity: parser recognizes the section.
    expect(scene.root.children[0]!.type).toBe("section");

    syncStoreToDom(scene, host);

    // After sync: .split-sec wrapper still exists and still contains
    // the two atomic children (image + content group). They must NOT
    // have been reparented directly under #sec_why.
    const wrapper = host.querySelector<HTMLElement>("#split_wrap");
    expect(wrapper).not.toBeNull();
    const imgEl = host.querySelector<HTMLElement>("#img_why");
    const contentEl = host.querySelector<HTMLElement>("#content_why");
    expect(imgEl).not.toBeNull();
    expect(contentEl).not.toBeNull();
    // Immediate parent must be the .split-sec wrapper, not the section.
    expect(imgEl!.parentElement).toBe(wrapper);
    expect(contentEl!.parentElement).toBe(wrapper);
  });

  it("keeps 4 stat dragables inside a .stats-inner grid wrapper", () => {
    const html = [
      '<div class="dragable stats-section" id="sec_stats">',
      '  <div class="stats-inner" id="stats_wrap">',
      '    <div class="dragable de-group stat-item" id="stat_1"><i>A</i></div>',
      '    <div class="dragable de-group stat-item" id="stat_2"><i>B</i></div>',
      '    <div class="dragable de-group stat-item" id="stat_3"><i>C</i></div>',
      '    <div class="dragable de-group stat-item" id="stat_4"><i>D</i></div>',
      '  </div>',
      '</div>',
    ].join("");
    const host = asHost(html);
    const scene: SceneGraph = legacyHtmlToScene(html);

    syncStoreToDom(scene, host);

    const wrapper = host.querySelector<HTMLElement>("#stats_wrap");
    expect(wrapper).not.toBeNull();
    for (const id of ["stat_1", "stat_2", "stat_3", "stat_4"]) {
      const el = host.querySelector<HTMLElement>(`#${id}`);
      expect(el, `#${id} must exist`).not.toBeNull();
      expect(el!.parentElement, `#${id} parent must be the .stats-inner wrapper`).toBe(wrapper);
    }
  });

  it("still reparents group children back into their de-group wrapper (unchanged behavior)", () => {
    // Groups (not sections) must still reparent their children into the
    // `.de-group.dragable` wrapper on sync.
    const html = [
      '<div class="de-group dragable" id="grp" style="position:absolute;left:0;top:0">',
      '  <div class="dragable" id="a" style="position:absolute;left:0;top:0;width:10px;height:10px">A</div>',
      '</div>',
      '<div class="dragable" id="b" style="position:absolute;left:20px;top:0;width:10px;height:10px">B</div>',
    ].join("");
    const host = asHost(html);
    const scene: SceneGraph = legacyHtmlToScene(html);

    // Simulate a group() action adding B into the group.
    const grp = scene.root.children[0]!;
    const b = scene.root.children[1]!;
    if (grp.type === "group") {
      grp.children.push(b);
    }
    scene.root.children = [grp];

    syncStoreToDom(scene, host);

    const grpEl = host.querySelector<HTMLElement>("#grp");
    expect(grpEl).not.toBeNull();
    const aEl = host.querySelector<HTMLElement>("#a");
    const bEl = host.querySelector<HTMLElement>("#b");
    expect(aEl!.parentElement).toBe(grpEl);
    expect(bEl!.parentElement).toBe(grpEl);  // reparented in
  });
});
