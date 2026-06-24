import { describe, it, expect } from "vitest";
import {
  parsePageWidthCss,
  upsertPageWidthCss,
  PAGE_WIDTH_MIN,
  PAGE_WIDTH_MAX,
} from "../page-width";

describe("page-width managed CSS block", () => {
  it("returns null when no managed block is present", () => {
    expect(parsePageWidthCss("")).toBeNull();
    expect(parsePageWidthCss(null)).toBeNull();
    // A bare legacy width rule (not the managed block) is NOT parsed here —
    // that path stays with the caller's heuristic.
    expect(parsePageWidthCss("#v_home_dft { width: 1130px }")).toBeNull();
  });

  it("round-trips a width through upsert → parse", () => {
    const css = upsertPageWidthCss("", 1200);
    expect(css).toContain("HNS-PAGE-WIDTH:START");
    expect(css).toContain("width: 1200px");
    expect(parsePageWidthCss(css)).toBe(1200);
  });

  it("allows widths narrower than the 1000 default", () => {
    const css = upsertPageWidthCss("", 960);
    expect(parsePageWidthCss(css)).toBe(960);
  });

  it("replaces (not duplicates) an existing block on re-apply", () => {
    let css = upsertPageWidthCss("body{color:red}", 1100);
    css = upsertPageWidthCss(css, 1300);
    expect(css.match(/HNS-PAGE-WIDTH:START/g)?.length).toBe(1);
    expect(parsePageWidthCss(css)).toBe(1300);
    expect(css).toContain("body{color:red}");
  });

  it("removes the block when width is 0 / null", () => {
    const css = upsertPageWidthCss("body{color:red}", 1200);
    expect(upsertPageWidthCss(css, 0)).not.toContain("HNS-PAGE-WIDTH");
    expect(upsertPageWidthCss(css, null)).not.toContain("HNS-PAGE-WIDTH");
    expect(parsePageWidthCss(upsertPageWidthCss(css, 0))).toBeNull();
  });

  it("clamps out-of-range values", () => {
    expect(parsePageWidthCss(upsertPageWidthCss("", 100))).toBe(PAGE_WIDTH_MIN);
    expect(parsePageWidthCss(upsertPageWidthCss("", 99999))).toBe(PAGE_WIDTH_MAX);
  });

  it("preserves surrounding CSS", () => {
    const base = "/* HNS-BODY-STYLE:START */\n#hns_body{background:#fff}\n/* HNS-BODY-STYLE:END */";
    const css = upsertPageWidthCss(base, 1240);
    expect(css).toContain("HNS-BODY-STYLE");
    expect(parsePageWidthCss(css)).toBe(1240);
  });
});
