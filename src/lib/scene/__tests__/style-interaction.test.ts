/**
 * Sprint 9k — InspectorPanel store-connection tests.
 *
 * Covers:
 * 1. Typography tokens (color, font-size, font-weight, line-height,
 *    letter-spacing, text-align) round-trip through parse/serialize
 *    without landing in legacyStyleExtras.
 * 2. Border split fields (border-color / border-width / border-style /
 *    border-radius) and box-shadow round-trip the same way.
 * 3. `data-hns-interaction` JSON is parsed into layer.interaction and
 *    emitted back verbatim on serialize — without also being duplicated
 *    via legacyAttrs (which would cause two copies in the output).
 */

import { describe, it, expect } from "vitest";
import { legacyHtmlToScene } from "../parse";
import { sceneToLegacyHtml } from "../serialize";
import type { Layer, LayerInteraction } from "../types";

function firstChild(scene: ReturnType<typeof legacyHtmlToScene>): Layer {
  const first = scene.root.children[0];
  if (!first) throw new Error("no top-level layer");
  return first;
}

describe("Sprint 9k — Inspector style tokens", () => {
  it("round-trips typography tokens into LayerStyle (not legacyStyleExtras)", () => {
    const html = `<div class="dragable" id="el_t1" style="position: absolute; left: 10px; top: 20px; width: 200px; height: 40px; color: #333; font-family: Pretendard; font-size: 18px; font-weight: 600; line-height: 1.5; letter-spacing: 0.02em; text-align: center">Hi</div>`;
    const scene = legacyHtmlToScene(html);
    const l = firstChild(scene);
    expect(l.style.color).toBe("#333");
    expect(l.style.fontFamily).toBe("Pretendard");
    expect(l.style.fontSize).toBe("18px");
    expect(l.style.fontWeight).toBe("600");
    expect(l.style.lineHeight).toBe("1.5");
    expect(l.style.letterSpacing).toBe("0.02em");
    expect(l.style.textAlign).toBe("center");
    // None of these should leak into legacyStyleExtras.
    const extras = l.legacyStyleExtras ?? {};
    for (const k of [
      "color",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "text-align",
    ]) {
      expect(extras[k]).toBeUndefined();
    }
    const out = sceneToLegacyHtml(scene);
    expect(out).toContain("color: #333");
    expect(out).toContain("font-family: Pretendard");
    expect(out).toContain("font-size: 18px");
    expect(out).toContain("font-weight: 600");
    expect(out).toContain("line-height: 1.5");
    expect(out).toContain("letter-spacing: 0.02em");
    expect(out).toContain("text-align: center");
  });

  it("round-trips border split fields and box-shadow", () => {
    const html = `<div class="dragable" id="el_b1" style="border-color: #e5e7eb; border-width: 1px; border-style: solid; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.08)">x</div>`;
    const scene = legacyHtmlToScene(html);
    const l = firstChild(scene);
    expect(l.style.borderColor).toBe("#e5e7eb");
    expect(l.style.borderWidth).toBe("1px");
    expect(l.style.borderStyle).toBe("solid");
    expect(l.style.borderRadius).toBe("12px");
    expect(l.style.boxShadow).toBe("0 2px 8px rgba(0,0,0,.08)");
    const out = sceneToLegacyHtml(scene);
    expect(out).toContain("border-color: #e5e7eb");
    expect(out).toContain("border-width: 1px");
    expect(out).toContain("border-style: solid");
    expect(out).toContain("border-radius: 12px");
    expect(out).toContain("box-shadow: 0 2px 8px rgba(0,0,0,.08)");
  });
});

describe("Sprint 9k — data-hns-interaction round-trip", () => {
  it("parses a valid JSON payload into layer.interaction", () => {
    const payload: LayerInteraction = { kind: "scrollTo", targetId: "hero", smooth: true };
    const html = `<div class="dragable" id="el_a1" data-hns-interaction='${JSON.stringify(payload)}'>x</div>`;
    const scene = legacyHtmlToScene(html);
    const l = firstChild(scene);
    expect(l.interaction).toEqual(payload);
  });

  it("drops malformed payloads without throwing", () => {
    const html = `<div class="dragable" id="el_a2" data-hns-interaction='not json'>x</div>`;
    const scene = legacyHtmlToScene(html);
    const l = firstChild(scene);
    expect(l.interaction).toBeUndefined();
  });

  it("emits the payload exactly once on serialize (no duplicate via legacyAttrs)", () => {
    const payload: LayerInteraction = { kind: "link", href: "https://example.com", target: "_blank" };
    const html = `<div class="dragable" id="el_a3" data-hns-interaction='${JSON.stringify(payload)}'>x</div>`;
    const scene = legacyHtmlToScene(html);
    const out = sceneToLegacyHtml(scene);
    // Count occurrences of the attribute in the output.
    const matches = out.match(/data-hns-interaction=/g) ?? [];
    expect(matches.length).toBe(1);
    // The serializer HTML-escapes double quotes as &quot; inside the
    // attribute value — verify the escaped form.
    expect(out).toContain("&quot;kind&quot;:&quot;link&quot;");
    expect(out).toContain("&quot;href&quot;:&quot;https://example.com&quot;");
  });
});
