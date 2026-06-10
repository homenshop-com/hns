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

  it("returns empty / falsy input unchanged", () => {
    expect(stripFooterPinnedTop("")).toBe("");
  });
});
