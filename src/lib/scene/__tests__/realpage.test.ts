/**
 * Real-page roundtrip validation.
 *
 * Feeds actual production body HTML through
 *   legacyHtmlToScene → sceneToLegacyHtml
 * and asserts that the normalized output equals the input. Catches
 * bugs that synthetic fixtures miss — e.g. unusual class combinations,
 * nested .dragable patterns, character encoding, Korean text.
 *
 * Fixture source: `scripts/scene-fixtures/*.html` — dump of
 * `Page.content.html` from the production DB.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { legacyHtmlToScene } from "../parse";
import { sceneToLegacyHtml } from "../serialize";
import { GroupLayer } from "../types";

const FIXTURE_DIR = join(__dirname, "../../../../scripts/scene-fixtures");

function normalize(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
  return serializeDom(doc.body);
}

function serializeDom(el: Element): string {
  const parts: string[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]!;
    if (c.nodeType === 1) parts.push(serializeNode(c as Element));
    else if (c.nodeType === 3) {
      const t = (c.textContent || "").replace(/\s+/g, " ");
      if (t.trim()) parts.push(t);
    }
  }
  return parts.join("");
}

function serializeNode(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const names: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) names.push(el.attributes[i]!.name);
  names.sort();
  const attrs = names.map((n) => {
    const v = el.getAttribute(n) ?? "";
    const norm = n === "style" ? normalizeStyle(v) : v.replace(/\s+/g, " ").trim();
    return `${n}="${norm}"`;
  });
  let inner = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]!;
    if (c.nodeType === 1) inner += serializeNode(c as Element);
    else if (c.nodeType === 3) inner += c.textContent || "";
  }
  return `<${tag} ${attrs.join(" ")}>${inner}</${tag}>`;
}

function normalizeStyle(v: string): string {
  const parts = v
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf(":");
      if (idx < 0) return p;
      return `${p.slice(0, idx).trim().toLowerCase()}: ${p.slice(idx + 1).trim()}`;
    });
  parts.sort();
  return parts.join("; ");
}

describe("real-page roundtrip", () => {
  let fixtures: string[] = [];
  try {
    fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".html"));
  } catch {
    fixtures = [];
  }

  if (fixtures.length === 0) {
    it.skip("no fixtures present", () => {});
    return;
  }

  for (const file of fixtures) {
    it(`roundtrips ${file}`, () => {
      const input = readFileSync(join(FIXTURE_DIR, file), "utf8");
      const scene = legacyHtmlToScene(input);
      const out = sceneToLegacyHtml(scene);

      const nIn = normalize(input);
      const nOut = normalize(out);

      // Diagnostic output on failure
      if (nIn !== nOut) {
        const inputDragables = (input.match(/<div[^>]*class="[^"]*dragable/g) || []).length;
        const outputDragables = (out.match(/<div[^>]*class="[^"]*dragable/g) || []).length;
        const topLayers = (scene.root as GroupLayer).children.length;
        // Show first 400 chars diff for debugging
        let diffAt = 0;
        while (diffAt < Math.min(nIn.length, nOut.length) && nIn[diffAt] === nOut[diffAt]) diffAt++;
        const context = 120;
        const inCtx = nIn.slice(Math.max(0, diffAt - 40), diffAt + context);
        const outCtx = nOut.slice(Math.max(0, diffAt - 40), diffAt + context);
        console.error(`\n--- Roundtrip diff for ${file} ---`);
        console.error(`input dragables: ${inputDragables}, output dragables: ${outputDragables}`);
        console.error(`scene top-level layers: ${topLayers}`);
        console.error(`first diff at offset ${diffAt} (input length ${nIn.length}, output ${nOut.length}):`);
        console.error(`  INPUT : ...${JSON.stringify(inCtx)}`);
        console.error(`  OUTPUT: ...${JSON.stringify(outCtx)}`);
      }

      expect(nOut).toBe(nIn);
    });
  }
});
