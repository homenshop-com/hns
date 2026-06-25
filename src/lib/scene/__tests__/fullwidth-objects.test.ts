import { describe, it, expect } from "vitest";
import {
  parseFullWidthIds,
  upsertFullWidthCss,
  toggleFullWidthId,
} from "../fullwidth-objects";

describe("fullwidth-objects managed block", () => {
  it("returns [] when no block present", () => {
    expect(parseFullWidthIds("")).toEqual([]);
    expect(parseFullWidthIds("#a{color:red}")).toEqual([]);
  });

  it("round-trips ids through upsert → parse", () => {
    const css = upsertFullWidthCss("", ["el_1", "el_2"], 1280);
    expect(css).toContain("HNS-FULLWIDTH");
    expect(css).toContain("@media (min-width:1280px)");
    expect(css).toContain("width:100vw!important");
    expect(parseFullWidthIds(css).sort()).toEqual(["el_1", "el_2"]);
  });

  it("toggle adds and removes a single id", () => {
    let css = toggleFullWidthId("", "el_1", true, 1000);
    expect(parseFullWidthIds(css)).toEqual(["el_1"]);
    css = toggleFullWidthId(css, "el_2", true, 1000);
    expect(parseFullWidthIds(css).sort()).toEqual(["el_1", "el_2"]);
    css = toggleFullWidthId(css, "el_1", false, 1000);
    expect(parseFullWidthIds(css)).toEqual(["el_2"]);
  });

  it("removes the block entirely when last id toggled off", () => {
    let css = toggleFullWidthId("body{color:red}", "el_1", true, 1000);
    css = toggleFullWidthId(css, "el_1", false, 1000);
    expect(css).not.toContain("HNS-FULLWIDTH");
    expect(css).toContain("body{color:red}");
  });

  it("dedupes repeated ids and preserves other CSS", () => {
    const css = upsertFullWidthCss("#x{top:0}", ["el_1", "el_1"], 1200);
    expect(parseFullWidthIds(css)).toEqual(["el_1"]);
    expect(css).toContain("#x{top:0}");
  });
});
