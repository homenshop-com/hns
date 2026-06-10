import { describe, it, expect } from "vitest";
import { stripFooterPinnedTop } from "../footer-flow";

describe("stripFooterPinnedTop", () => {
  it("removes inline top + position from a footer .dragable, keeps the rest", () => {
    const html =
      '<div id="f1" class="dragable sol-replacible-text " style="text-align: center; width: 1058px !important; height: 86px !important; left: 41px !important; top: 1596px !important; position: absolute !important;">Home | About Us</div>';
    const out = stripFooterPinnedTop(html);
    expect(out).not.toMatch(/top\s*:/i);
    expect(out).not.toMatch(/position\s*:/i);
    // preserved
    expect(out).toMatch(/text-align:\s*center/i);
    expect(out).toMatch(/width:\s*1058px/i);
    expect(out).toMatch(/height:\s*86px/i);
    expect(out).toMatch(/left:\s*41px/i);
    // structure intact
    expect(out).toContain("Home | About Us");
    expect(out).toContain('id="f1"');
  });

  it("handles position before top and arbitrary order", () => {
    const html =
      '<div class="dragable" style="position:absolute;top:200px;left:10px;width:50px">x</div>';
    const out = stripFooterPinnedTop(html);
    expect(out).not.toMatch(/(^|;|")\s*top\s*:/i);
    expect(out).not.toMatch(/position\s*:/i);
    expect(out).toMatch(/left:10px/);
    expect(out).toMatch(/width:50px/);
  });

  it("does NOT strip border-top / margin-top / background-position", () => {
    const html =
      '<div class="dragable" style="border-top:1px solid red;margin-top:5px;background-position:right 0;left:3px">y</div>';
    const out = stripFooterPinnedTop(html);
    expect(out).toMatch(/border-top:1px solid red/);
    expect(out).toMatch(/margin-top:5px/);
    expect(out).toMatch(/background-position:right 0/);
    expect(out).toMatch(/left:3px/);
  });

  it("leaves non-dragable elements untouched", () => {
    const html = '<a href="#" style="top:5px;position:absolute">link</a>';
    expect(stripFooterPinnedTop(html)).toBe(html);
  });

  it("leaves inner (nested) content of the dragable alone except the dragable tag itself", () => {
    const html =
      '<div class="dragable" style="top:10px;position:absolute;left:2px"><span style="top:1px">a</span></div>';
    const out = stripFooterPinnedTop(html);
    // inner span keeps its top (not a dragable)
    expect(out).toMatch(/<span style="top:1px">a<\/span>/);
    // outer dragable lost top/position
    expect(out).toMatch(/<div class="dragable" style="left:2px">/);
  });

  it("ONLY strips direct children — nested #hns_footer_content .dragable keep absolute", () => {
    // logo-left / text-right footer: a footer_content wrapper holds two
    // absolutely-positioned dragables. The wrapper is the direct child (top
    // level); its children are nested and must KEEP their absolute geometry.
    const html =
      '<div id="hns_footer_content" class="dragable" style="position:relative;top:0px">' +
      '<div class="dragable hnsfoot_logo" style="position:absolute;left:0px;top:5px">logo</div>' +
      '<div class="dragable hnsfoot_text" style="position:absolute;left:600px;top:5px">text</div>' +
      "</div>";
    const out = stripFooterPinnedTop(html);
    // nested children KEEP absolute + top
    expect(out).toMatch(/hnsfoot_logo" style="position:absolute;left:0px;top:5px"/);
    expect(out).toMatch(/hnsfoot_text" style="position:absolute;left:600px;top:5px"/);
    // the top-level wrapper lost its top/position (it flows after the body)
    expect(out).toMatch(/id="hns_footer_content" class="dragable" style=""/);
  });

  it("strips each of multiple TOP-LEVEL footer dragables (flat footer)", () => {
    const html =
      '<div class="dragable" style="top:10px;position:absolute;left:1px">a</div>' +
      '<div class="dragable" style="top:20px;position:absolute;left:2px">b</div>';
    const out = stripFooterPinnedTop(html);
    expect(out).not.toMatch(/top\s*:/i);
    expect(out).not.toMatch(/position\s*:/i);
    expect(out).toMatch(/left:1px/);
    expect(out).toMatch(/left:2px/);
  });

  it("does not let a void <img> child shift depth tracking", () => {
    const html =
      '<div class="dragable" style="top:3px;position:absolute;left:9px"><img src="x.png"><span>z</span></div>' +
      '<div class="dragable" style="top:4px;position:absolute;left:8px">w</div>';
    const out = stripFooterPinnedTop(html);
    // both TOP-LEVEL dragables stripped (the void img must not desync depth)
    expect(out).toMatch(/<div class="dragable" style="left:9px">/);
    expect(out).toMatch(/<div class="dragable" style="left:8px">/);
  });

  it("returns empty / falsy input unchanged", () => {
    expect(stripFooterPinnedTop("")).toBe("");
  });
});
