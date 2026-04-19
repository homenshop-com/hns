/**
 * Transform parse/serialize roundtrip tests.
 */

import { describe, it, expect } from "vitest";
import {
  parseTransform,
  parseTransformOrigin,
  printTransform,
  printTransformOrigin,
} from "../parse-transform";
import { legacyHtmlToScene, sceneToLegacyHtml } from "..";

describe("parseTransform", () => {
  it("parses rotate in deg / rad / turn", () => {
    expect(parseTransform("rotate(45deg)")).toEqual({ rotate: 45 });
    expect(parseTransform("rotate(0.5turn)")).toEqual({ rotate: 180 });
    const rad = parseTransform("rotate(1rad)");
    expect(rad!.rotate).toBeCloseTo(57.2957, 2);
  });

  it("parses scale variants", () => {
    expect(parseTransform("scale(2)")).toEqual({ scaleX: 2, scaleY: 2 });
    expect(parseTransform("scale(1.5, 0.5)")).toEqual({ scaleX: 1.5, scaleY: 0.5 });
    expect(parseTransform("scaleX(2)")).toEqual({ scaleX: 2 });
    expect(parseTransform("scaleY(0.5)")).toEqual({ scaleY: 0.5 });
  });

  it("parses rotate+scale stacks", () => {
    expect(parseTransform("rotate(30deg) scale(1.2)")).toEqual({
      rotate: 30,
      scaleX: 1.2,
      scaleY: 1.2,
    });
  });

  it("returns null for unsupported shapes (matrix, translate, skew)", () => {
    expect(parseTransform("matrix(1,0,0,1,10,20)")).toBeNull();
    expect(parseTransform("translate(10px, 20px)")).toBeNull();
    expect(parseTransform("skew(5deg)")).toBeNull();
    expect(parseTransform("rotate(45deg) translate(10px, 0)")).toBeNull();
  });

  it("handles none / empty / missing", () => {
    expect(parseTransform(null)).toBeNull();
    expect(parseTransform("")).toBeNull();
    expect(parseTransform("none")).toBeNull();
  });
});

describe("parseTransformOrigin", () => {
  it("parses two-value percent form", () => {
    expect(parseTransformOrigin("50% 50%")).toEqual({ originX: 50, originY: 50 });
    expect(parseTransformOrigin("0% 100%")).toEqual({ originX: 0, originY: 100 });
  });

  it("single value defaults Y to 50", () => {
    expect(parseTransformOrigin("30%")).toEqual({ originX: 30, originY: 50 });
  });

  it("rejects px / keyword forms (Tier-2 percent-only)", () => {
    expect(parseTransformOrigin("50px 50px")).toBeNull();
    expect(parseTransformOrigin("center")).toBeNull();
  });
});

describe("printTransform / printTransformOrigin", () => {
  it("prints rotate only when non-zero", () => {
    expect(printTransform({ rotate: 0 })).toBeUndefined();
    expect(printTransform({ rotate: 45 })).toBe("rotate(45deg)");
  });

  it("prints scale combined when sx=sy, split otherwise", () => {
    expect(printTransform({ scaleX: 2, scaleY: 2 })).toBe("scale(2)");
    expect(printTransform({ scaleX: 1.5, scaleY: 0.5 })).toBe("scale(1.5, 0.5)");
  });

  it("drops identity values entirely", () => {
    expect(printTransform({ scaleX: 1, scaleY: 1 })).toBeUndefined();
    expect(printTransform({})).toBeUndefined();
  });

  it("prints rotate + scale in order", () => {
    expect(printTransform({ rotate: 30, scaleX: 2, scaleY: 2 })).toBe(
      "rotate(30deg) scale(2)",
    );
  });

  it("prints origin as percentages", () => {
    expect(printTransformOrigin({ originX: 30, originY: 70 })).toBe("30% 70%");
    expect(printTransformOrigin({ originX: 50 })).toBe("50% 50%");
    expect(printTransformOrigin({})).toBeUndefined();
  });
});

describe("transform HTML roundtrip", () => {
  it("preserves rotate(45deg) and transform-origin through the scene graph", () => {
    const html = `<div id="a" class="dragable" style="position: absolute; left: 10px; top: 20px; width: 100px; height: 50px; transform: rotate(45deg); transform-origin: 50% 50%">A</div>`;
    const scene = legacyHtmlToScene(html);
    const a = scene.root.children[0]!;
    expect(a.transform).toBeDefined();
    expect(a.transform!.rotate).toBe(45);
    expect(a.transform!.originX).toBe(50);
    const out = sceneToLegacyHtml(scene);
    expect(out).toContain("transform: rotate(45deg)");
    expect(out).toContain("transform-origin: 50% 50%");
  });

  it("preserves unsupported transforms verbatim via extras", () => {
    const html = `<div id="b" class="dragable" style="position: absolute; left: 0px; top: 0px; width: 10px; height: 10px; transform: matrix(1, 0, 0, 1, 5, 5)">B</div>`;
    const scene = legacyHtmlToScene(html);
    const b = scene.root.children[0]!;
    // Shouldn't be decomposed; preserved as extras.
    expect(b.transform).toBeUndefined();
    expect(b.legacyStyleExtras?.transform).toBe("matrix(1, 0, 0, 1, 5, 5)");
    const out = sceneToLegacyHtml(scene);
    expect(out).toContain("matrix(1, 0, 0, 1, 5, 5)");
  });

  it("roundtrips idempotently", () => {
    const html = `<div id="c" class="dragable" style="position: absolute; left: 0px; top: 0px; width: 100px; height: 100px; transform: rotate(15deg) scale(1.2); transform-origin: 0% 100%">C</div>`;
    const s1 = legacyHtmlToScene(html);
    const h1 = sceneToLegacyHtml(s1);
    const s2 = legacyHtmlToScene(h1);
    const h2 = sceneToLegacyHtml(s2);
    expect(h2).toBe(h1);
  });
});
