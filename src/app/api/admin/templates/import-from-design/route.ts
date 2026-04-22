/**
 * POST /api/admin/templates/import-from-design
 *
 * Paste-and-go template importer. Takes the "Send to local coding agent"
 * command copied from claude.ai/design (Share → Handoff to Claude Code),
 * fetches the design bundle, asks Claude Sonnet to convert the single-
 * page React/Babel prototype into homeNshop atomic-layer Template
 * format, and inserts a new row.
 *
 * Input command shape (what the admin pastes):
 *
 *   Fetch this design file, read its readme, and implement the relevant
 *   aspects of the design. https://api.anthropic.com/v1/design/h/<hash>
 *   ?open_file=<filename>
 *
 *   Implement: <filename>
 *
 * Flow:
 *   1. Extract https://api.anthropic.com/v1/design/h/<hash> URL from command
 *   2. GET that URL → 1-2MB gzip'd POSIX tar
 *   3. gunzip + parse tar → pick test/README.md + test/project/<open_file>
 *   4. POST both to Claude (claude-sonnet-4-6) with a tool-use schema
 *      that constrains output to { name, cssText, headerHtml, menuHtml,
 *      footerHtml, pages[] }
 *   5. Insert as system Template (userId: null, isPublic: false).
 *      cssText gets the HNS-MODERN-TEMPLATE marker prepended so the
 *      publisher + editor detect it correctly.
 *   6. Return { id, editUrl } → admin UI navigates to basic-info page.
 *
 * Auth: admin + template-editor allowlist (master@, design@).
 * Credits: not metered — this is an admin-only tool.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditTemplates } from "@/lib/permissions";
import { gunzipSync } from "zlib";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.AI_IMPORT_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = 40000;

export const maxDuration = 240;

/* ─── Tar parsing (minimal, POSIX-only) ───────────────────────────── */

/**
 * Parse a raw tar buffer into a `filename → content Buffer` map.
 *
 * POSIX ustar layout: 512-byte header + content rounded up to 512-byte
 * blocks. We only keep regular files (typeflag '0' or '\0') and skip
 * any directory / link / pax entries. This is ~20 LOC instead of
 * pulling in `tar-stream` (18kb dep) for a single-use path.
 */
function parseTar(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
    if (!name) break; // two zero blocks = end of archive
    const sizeStr = header.subarray(124, 136).toString("utf-8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeStr, 8);
    if (!Number.isFinite(size) || size < 0) break;
    const typeFlag = header[156];
    offset += 512;
    // '0' (0x30) and NUL (0x00) are both "regular file" in ustar.
    const isRegular = typeFlag === 0x30 || typeFlag === 0x00;
    if (isRegular && size > 0) {
      files.set(name, buf.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

/* ─── Command parsing ──────────────────────────────────────────────── */

interface ParsedCommand {
  url: string;
  openFile: string;
}

/**
 * Parse the Claude Design "Send to local coding agent" command.
 * Accepts both the full command with prose wrapping or just the URL.
 */
function parseCommand(command: string): ParsedCommand | null {
  const urlMatch = command.match(
    /https:\/\/api\.anthropic\.com\/v1\/design\/h\/[A-Za-z0-9_-]+(?:\?[^\s]*)?/,
  );
  if (!urlMatch) return null;
  const url = urlMatch[0];
  let openFile = "";
  try {
    const u = new URL(url);
    openFile = u.searchParams.get("open_file") || "";
  } catch {
    return null;
  }
  // Fallback: some commands also include `Implement: foo.html` — honor it.
  if (!openFile) {
    const implMatch = command.match(/Implement:\s*([^\n]+\.html?)/i);
    if (implMatch) openFile = implMatch[1]!.trim();
  }
  return { url, openFile };
}

/* ─── AI conversion prompt ─────────────────────────────────────────── */

const CONVERT_SYSTEM_PROMPT = `You are converting a Claude Design prototype (HTML/CSS/JS, usually React+Babel inline) into homeNshop's static Template format.

Input you'll receive:
- README from the design bundle (describes the intent)
- The primary HTML prototype file
- Optional additional HTML files referenced by the prototype

Your job: call the import_template tool with the finished template.

Output format (import_template tool parameters):
- name: short Korean/English brand name, 30 chars max
- cssText: full site CSS. MUST start with "/* HNS-MODERN-TEMPLATE */" marker on its own line. Then your CSS. Preserve the prototype's design system (tokens, typography, spacing). Use max-width: 100% on all container rules — NEVER center at a fixed 1200/1360px. Add a @media (max-width: 768px) mobile block.
- headerHtml: the site's topbar + sticky GNB. MUST include a <nav> with all top-level page links (use relative hrefs like "about.html"). Include the brand logo.
- menuHtml: exactly "<div id=\\"hns_menu\\"></div>" (empty wrapper — nav lives in headerHtml; publisher dedups).
- footerHtml: multi-column footer with brand / address / contact / sitemap.
- pages: 3-6 pages. One MUST have slug "index" (home). Slugs are lowercase [a-z]+. Each page has { title, slug, showInMenu: true, bodyHtml }.

Atomic layering rules for EVERY bodyHtml:
- Wrap each top-level section in <div class="dragable" id="obj_sec_{unique}">…</div>. No inline position on section wrappers.
- Inside sections, each editable title/text/image/button is its own <div class="dragable" id="obj_{type}_{unique}">…</div>:
    - text/titles: add class "sol-replacible-text"
    - card groups: add class "de-group"
- Use obj_title_ / obj_text_ / obj_img_ / obj_btn_ / obj_card_ / obj_sec_ ID prefixes.
- Internal links MUST be relative: href="about.html" not "/about.html".
- Images MUST use absolute Pexels proxy: https://homenshop.com/api/img?q={english-keyword}&w={width}&h={height}
  Never picsum.photos; never relative /api/img.
- Font Awesome icons <i class="fa-solid fa-arrow-right"></i> — no emojis.

Design fidelity:
- Preserve the prototype's visual intent: colors, typography, spacing, section order, UI patterns (hero / features / testimonials / CTA / footer etc).
- React prototypes: DROP all React/Babel/JSX. DROP interactive widgets (tweaks panels, slider arrows, state hooks). For hero sliders, pick ONE slide and render it statically.
- Convert placeholder blocks (diagonal stripes + mono labels) to real Pexels photos matching the intended subject (instructor portrait, product shot, team, workspace, etc.).
- The prototype is a single page; you expand it into 3-6 homeNshop pages by splitting the natural sections (About / Courses / Notice / Contact etc.) into their own pages.

Do NOT:
- Return prose. Only call the tool.
- Emit fixed max-width containers (1200/1360px).
- Use <nav> twice (once in headerHtml is correct; menuHtml is the empty wrapper).
- Use absolute positioning on section wrappers.
- Skip the /* HNS-MODERN-TEMPLATE */ marker at the top of cssText.`;

/* ─── Auth ─────────────────────────────────────────────────────────── */

async function requireTemplateEditor() {
  const session = await auth();
  if (!session) {
    return { ok: false as const, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, email: true },
  });
  if (user?.role !== "ADMIN" || !canEditTemplates(user.email)) {
    return { ok: false as const, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

/* ─── Route ────────────────────────────────────────────────────────── */

interface ImportedTemplate {
  name: string;
  cssText: string;
  headerHtml: string;
  menuHtml: string;
  footerHtml: string;
  pages: Array<{ title: string; slug: string; showInMenu?: boolean; bodyHtml: string }>;
}

export async function POST(req: NextRequest) {
  const guard = await requireTemplateEditor();
  if (!guard.ok) return guard.res;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null) as { command?: string } | null;
  const command = (body?.command || "").trim();
  if (!command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const parsed = parseCommand(command);
  if (!parsed) {
    return NextResponse.json({
      error: "명령에서 claude.ai/design URL 을 찾을 수 없습니다. 'Copy command' 로 복사한 내용을 그대로 붙여넣어 주세요.",
    }, { status: 400 });
  }

  /* Step 1 — download the design bundle */
  let bundleBuffer: Buffer;
  try {
    const res = await fetch(parsed.url, {
      headers: { "User-Agent": "homeNshop-admin-template-importer/1.0" },
    });
    if (!res.ok) {
      return NextResponse.json({
        error: `디자인 번들 다운로드 실패 (HTTP ${res.status}). 공유 URL 이 유효한지 확인하세요.`,
      }, { status: 502 });
    }
    bundleBuffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("[import-from-design] fetch failed", e);
    return NextResponse.json({ error: "디자인 번들 다운로드 중 오류" }, { status: 502 });
  }

  /* Step 2 — gunzip + tar parse */
  let files: Map<string, Buffer>;
  try {
    const raw = gunzipSync(bundleBuffer);
    files = parseTar(raw);
  } catch (e) {
    console.error("[import-from-design] extract failed", e);
    return NextResponse.json({
      error: "번들 형식이 올바르지 않습니다 (gzip + tar 가 아님).",
    }, { status: 400 });
  }

  /* Step 3 — locate README + primary HTML */
  const readmePath = Array.from(files.keys()).find((k) => /README\.md$/i.test(k));
  const htmlCandidates = Array.from(files.keys()).filter((k) => /\.html?$/i.test(k));
  let primaryHtmlKey = parsed.openFile
    ? htmlCandidates.find((k) => k.endsWith(`/${parsed.openFile}`) || k === parsed.openFile)
    : undefined;
  if (!primaryHtmlKey) primaryHtmlKey = htmlCandidates[0];
  if (!primaryHtmlKey) {
    return NextResponse.json({
      error: "번들에서 HTML 파일을 찾을 수 없습니다.",
    }, { status: 400 });
  }

  const readme = readmePath ? files.get(readmePath)!.toString("utf-8") : "";
  const primaryHtml = files.get(primaryHtmlKey)!.toString("utf-8");

  // Budget the prompt. HTML can be huge (~40kb+) — if over 80kb, trim
  // the prototype since Claude handles the visual intent even from
  // truncated source.
  const MAX_HTML_CHARS = 80_000;
  const htmlForPrompt = primaryHtml.length > MAX_HTML_CHARS
    ? primaryHtml.slice(0, MAX_HTML_CHARS) + "\n\n[... truncated, " + (primaryHtml.length - MAX_HTML_CHARS) + " chars more ...]"
    : primaryHtml;

  /* Step 4 — call Claude Sonnet with import_template tool */
  const userMessage = [
    "Convert this Claude Design prototype into a homeNshop template.",
    "",
    "=== README ===",
    readme || "(no README in bundle)",
    "",
    `=== Primary HTML (${primaryHtmlKey}, ${primaryHtml.length} chars) ===`,
    htmlForPrompt,
  ].join("\n");

  let aiResult: ImportedTemplate | null = null;
  let lastError = "";
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: CONVERT_SYSTEM_PROMPT,
        tools: [{
          name: "import_template",
          description: "Submit the converted template as structured data.",
          input_schema: {
            type: "object",
            required: ["name", "cssText", "headerHtml", "menuHtml", "footerHtml", "pages"],
            properties: {
              name: { type: "string" },
              cssText: { type: "string" },
              headerHtml: { type: "string" },
              menuHtml: { type: "string" },
              footerHtml: { type: "string" },
              pages: {
                type: "array", minItems: 3, maxItems: 6,
                items: {
                  type: "object",
                  required: ["title", "slug", "bodyHtml"],
                  properties: {
                    title: { type: "string" },
                    slug: { type: "string" },
                    showInMenu: { type: "boolean" },
                    bodyHtml: { type: "string" },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: "tool", name: "import_template" },
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[import-from-design] Anthropic error", aiRes.status, errText);
      return NextResponse.json({
        error: `AI 변환 실패 (HTTP ${aiRes.status})`,
      }, { status: 502 });
    }
    const data = await aiRes.json();
    const toolBlock = Array.isArray(data.content)
      ? data.content.find((c: { type?: string; name?: string }) =>
          c?.type === "tool_use" && c?.name === "import_template")
      : null;
    if (!toolBlock) {
      return NextResponse.json({
        error: data.stop_reason === "max_tokens"
          ? "AI 가 토큰 한도에 도달했습니다. 더 단순한 디자인으로 다시 시도하거나 AI_IMPORT_MAX_TOKENS 를 늘려주세요."
          : "AI 가 올바른 형식으로 응답하지 않았습니다.",
      }, { status: 502 });
    }
    aiResult = (toolBlock as { input: ImportedTemplate }).input;
  } catch (e) {
    console.error("[import-from-design] AI call failed", e);
    lastError = (e instanceof Error ? e.message : String(e)) || "AI call failed";
    return NextResponse.json({ error: `AI 호출 중 오류: ${lastError}` }, { status: 502 });
  }

  if (!aiResult) {
    return NextResponse.json({ error: "AI 응답이 비어있습니다." }, { status: 502 });
  }

  /* Step 5 — normalize + insert */
  const name = (aiResult.name || "Imported Template").trim().slice(0, 100);
  // Guarantee the HNS-MODERN-TEMPLATE marker is at the top.
  let cssText = (aiResult.cssText || "").trim();
  if (!cssText.includes("/* HNS-MODERN-TEMPLATE */")) {
    cssText = "/* HNS-MODERN-TEMPLATE */\n" + cssText;
  }
  // menuHtml — override whatever AI sent. Empty wrapper only.
  const menuHtml = `<div id="hns_menu"></div>`;
  const headerHtml = (aiResult.headerHtml || "").trim();
  const footerHtml = (aiResult.footerHtml || "").trim();

  // Normalize pages — ensure one has slug "index", dedupe slugs,
  // clamp counts, wrap bodyHtml into the content JSON shape.
  const rawPages = Array.isArray(aiResult.pages) ? aiResult.pages : [];
  if (rawPages.length === 0) {
    return NextResponse.json({ error: "AI 가 페이지를 생성하지 못했습니다." }, { status: 502 });
  }
  if (!rawPages.some((p) => p?.slug === "index") && rawPages[0]) {
    rawPages[0].slug = "index";
  }
  const seen = new Set<string>();
  const pagesSnapshot = rawPages
    .map((p, i) => {
      let slug = (p.slug || `page-${i + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!slug) slug = `page-${i + 1}`;
      while (seen.has(slug)) slug = `${slug}-${i}`;
      seen.add(slug);
      return {
        title: (p.title || slug).trim().slice(0, 80),
        slug,
        lang: "ko",
        isHome: slug === "index",
        showInMenu: p.showInMenu !== false,
        sortOrder: i,
        content: { html: p.bodyHtml || "" },
        css: null,
      };
    })
    .slice(0, 6);

  const id = `tpl_import_${Date.now().toString(36)}`;
  const path = `system/import-${Date.now().toString(36)}`;

  const template = await prisma.template.create({
    data: {
      id,
      name,
      path,
      category: "imported",
      price: 0,
      keywords: "imported,claude-design",
      description: "Claude Design 번들에서 가져옴. 관리자에서 기본정보·썸네일 수정 후 공개 전환하세요.",
      isActive: true,
      isPublic: false,
      sortOrder: 0,
      headerHtml,
      menuHtml,
      footerHtml,
      cssText,
      userId: null,
      pagesSnapshot: pagesSnapshot as unknown as object,
    },
  });

  return NextResponse.json({
    id: template.id,
    name: template.name,
    editUrl: `/admin/templates/${template.id}`,
    stats: {
      pages: pagesSnapshot.length,
      headerChars: headerHtml.length,
      footerChars: footerHtml.length,
      cssChars: cssText.length,
      bundleFiles: files.size,
      htmlChars: primaryHtml.length,
    },
  });
}
