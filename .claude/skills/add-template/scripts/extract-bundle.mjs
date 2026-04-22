#!/usr/bin/env node
/**
 * extract-bundle.mjs — Given a Claude Design command (first arg or stdin),
 * download the bundle and extract it to ./design-bundle/ for inspection.
 *
 * Usage:
 *   node extract-bundle.mjs "Fetch this design file... https://api.anthropic.com/v1/design/h/XXX?open_file=Foo.html ..."
 *   echo "<command>" | node extract-bundle.mjs
 *
 * Output: writes to ./design-bundle/, prints README path + primary HTML path.
 * Intended for the add-template skill's "경로 C" (CLI seed script authoring).
 */

import { gunzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

function parseCommand(text) {
  const urlMatch = text.match(
    /https:\/\/api\.anthropic\.com\/v1\/design\/h\/[A-Za-z0-9_-]+(?:\?[^\s]*)?/,
  );
  if (!urlMatch) return null;
  const url = urlMatch[0];
  let openFile = "";
  try {
    openFile = new URL(url).searchParams.get("open_file") || "";
  } catch {}
  if (!openFile) {
    const m = text.match(/Implement:\s*([^\n]+\.html?)/i);
    if (m) openFile = m[1].trim();
  }
  return { url, openFile };
}

/** Minimal POSIX tar parser. Returns filename → Buffer. */
function parseTar(buf) {
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
    if (!name) break;
    const sizeStr = header.subarray(124, 136).toString("utf-8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeStr, 8);
    if (!Number.isFinite(size) || size < 0) break;
    const typeFlag = header[156];
    offset += 512;
    if ((typeFlag === 0x30 || typeFlag === 0x00) && size > 0) {
      files.set(name, buf.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

async function main() {
  let command = process.argv[2];
  if (!command) {
    // Read from stdin.
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    command = Buffer.concat(chunks).toString("utf-8");
  }
  command = (command || "").trim();
  if (!command) {
    console.error("Usage: node extract-bundle.mjs '<claude design command>'");
    process.exit(1);
  }

  const parsed = parseCommand(command);
  if (!parsed) {
    console.error("✗ 명령에서 api.anthropic.com/v1/design/h/... URL 을 찾을 수 없습니다");
    process.exit(1);
  }

  console.log(`▸ URL: ${parsed.url}`);
  console.log(`▸ open_file: ${parsed.openFile || "(없음)"}`);

  console.log("▸ 번들 다운로드 중…");
  const res = await fetch(parsed.url, {
    headers: { "User-Agent": "homeNshop-add-template-skill/1.0" },
  });
  if (!res.ok) {
    console.error(`✗ HTTP ${res.status} — 링크가 유효하지 않거나 만료됐습니다`);
    process.exit(1);
  }
  const gz = Buffer.from(await res.arrayBuffer());
  console.log(`  (${(gz.length / 1024).toFixed(1)} KB gzip)`);

  console.log("▸ 압축 해제 + tar 파싱 중…");
  const raw = gunzipSync(gz);
  const files = parseTar(raw);
  console.log(`  ${files.size} 파일`);

  const outDir = process.env.EXTRACT_DIR || "./design-bundle";
  for (const [name, content] of files) {
    const full = join(outDir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  const readme = Array.from(files.keys()).find((k) => /README\.md$/i.test(k));
  const htmls = Array.from(files.keys()).filter((k) => /\.html?$/i.test(k));
  const primary = parsed.openFile
    ? htmls.find((k) => k.endsWith(`/${parsed.openFile}`) || k === parsed.openFile)
    : htmls[0];

  console.log(`\n✓ 추출 완료 → ${outDir}/`);
  if (readme) console.log(`  README:  ${outDir}/${readme}`);
  if (primary) console.log(`  HTML:    ${outDir}/${primary}`);
  for (const h of htmls.filter((k) => k !== primary)) {
    console.log(`  (추가):  ${outDir}/${h}`);
  }
  const chats = Array.from(files.keys()).filter((k) => /chats\/.+\.md$/i.test(k));
  for (const c of chats) console.log(`  chat:    ${outDir}/${c}`);
  console.log("\n다음 단계: README + HTML 읽고 scripts/seed-<slug>-template.mjs 작성 (Agency/Plus Academy 참조).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
