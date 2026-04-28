import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

const UPLOAD_BASE = process.env.UPLOAD_PATH || "/var/www/uploads";

const MAX_ZIP_BYTES = 30 * 1024 * 1024;
const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 15 * 1024 * 1024;

const HTML_RE = /\.html?$/i;
const CSS_RE = /\.css$/i;
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|json|js|map)$/i;

function isSafePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return false;
  if (p.includes("..")) return false;
  if (p.includes("\\")) return false;
  return true;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim();
  const zipFile = formData.get("zip") as File | null;

  if (!name) {
    return NextResponse.json({ error: "템플릿 이름을 입력하세요." }, { status: 400 });
  }
  if (!zipFile) {
    return NextResponse.json({ error: "zip 파일을 업로드하세요." }, { status: 400 });
  }
  if (zipFile.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: `파일 크기 초과 (최대 ${MAX_ZIP_BYTES / 1024 / 1024}MB)` },
      { status: 400 },
    );
  }

  const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (err) {
    console.error("[zip] parse failed:", err);
    return NextResponse.json({ error: "zip 파일을 읽을 수 없습니다." }, { status: 400 });
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length === 0) {
    return NextResponse.json({ error: "zip 안에 파일이 없습니다." }, { status: 400 });
  }
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json(
      { error: `zip 항목이 너무 많습니다 (최대 ${MAX_ENTRIES}개)` },
      { status: 400 },
    );
  }

  type Extracted = { name: string; relPath: string; buffer: Buffer };
  const htmls: Extracted[] = [];
  const csses: Extracted[] = [];
  const assets: Extracted[] = [];

  for (const entry of entries) {
    const entryPath = entry.name;
    if (!isSafePath(entryPath)) continue;
    if (entryPath.startsWith("__MACOSX/") || entryPath.includes("/.DS_Store")) continue;

    const baseName = entryPath.split("/").pop() || entryPath;
    if (!baseName || baseName.startsWith(".")) continue;

    const buffer = Buffer.from(await entry.async("uint8array"));
    if (buffer.length > MAX_ENTRY_BYTES) {
      return NextResponse.json(
        { error: `항목 크기 초과: ${baseName}` },
        { status: 400 },
      );
    }

    if (HTML_RE.test(baseName)) {
      htmls.push({ name: baseName.replace(/\.htm$/i, ".html"), relPath: entryPath, buffer });
    } else if (CSS_RE.test(baseName)) {
      csses.push({ name: baseName, relPath: entryPath, buffer });
    } else if (ASSET_RE.test(baseName)) {
      assets.push({ name: baseName, relPath: entryPath, buffer });
    }
  }

  if (htmls.length === 0) {
    return NextResponse.json(
      { error: "zip 안에 HTML 파일이 없습니다." },
      { status: 400 },
    );
  }

  const tplId = `user_${session.user.id}_${Date.now()}`;
  const tplPath = `user-templates/${tplId}`;
  const diskDir = path.join(UPLOAD_BASE, "templates", tplId);
  const filesDir = path.join(diskDir, "files");

  try {
    fs.mkdirSync(filesDir, { recursive: true });

    const pageData: { slug: string; title: string; bodyHtml: string }[] = [];
    for (const h of htmls) {
      fs.writeFileSync(path.join(diskDir, h.name.toLowerCase()), h.buffer);
      const html = h.buffer.toString("utf-8");
      const bodyHtml = extractBody(html);
      const slug = h.name.toLowerCase().replace(/\.html$/, "");
      const title = slug === "index" ? "HOME" : slug.charAt(0).toUpperCase() + slug.slice(1);
      pageData.push({ slug, title, bodyHtml });
    }

    pageData.sort((a, b) => {
      if (a.slug === "index") return -1;
      if (b.slug === "index") return 1;
      return a.slug.localeCompare(b.slug);
    });

    const baseUrl = `/uploads/templates/${tplId}/files`;
    let cssText = "";
    if (csses.length > 0) {
      const merged = csses.map((c) => c.buffer.toString("utf-8")).join("\n\n");
      fs.writeFileSync(path.join(filesDir, "default.css"), merged, "utf-8");
      cssText = merged.replace(
        /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
        (_, filename) => {
          const fname = (filename as string).split("/").pop() || filename;
          return `url(${baseUrl}/${fname})`;
        },
      );
    }

    for (const a of assets) {
      fs.writeFileSync(path.join(filesDir, a.name), a.buffer);
    }

    const indexHtmlEntry = htmls.find((h) => h.name.toLowerCase() === "index.html");
    let headerHtml = "";
    let menuHtml = "";
    let footerHtml = "";
    if (indexHtmlEntry) {
      const fullHtml = indexHtmlEntry.buffer.toString("utf-8");
      headerHtml = extractSection(fullHtml, "hns_header") || extractSection(fullHtml, "header") || "";
      menuHtml = extractSection(fullHtml, "hns_menu") || extractSection(fullHtml, "nav") || "";
      footerHtml = extractSection(fullHtml, "hns_footer") || extractSection(fullHtml, "footer") || "";
    }

    const template = await prisma.template.create({
      data: {
        userId: session.user.id,
        name,
        path: tplPath,
        cssText,
        headerHtml: headerHtml || null,
        menuHtml: menuHtml || null,
        footerHtml: footerHtml || null,
        category: "custom",
        isActive: true,
      },
    });

    return NextResponse.json(
      {
        template,
        pages: pageData,
        stats: { html: htmls.length, css: csses.length, assets: assets.length },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[from-claude-zip] failed:", err);
    try {
      if (fs.existsSync(diskDir)) fs.rmSync(diskDir, { recursive: true, force: true });
    } catch {}
    return NextResponse.json({ error: "템플릿 생성에 실패했습니다." }, { status: 500 });
  }
}

function extractBody(html: string): string {
  const hnsMatch = html.match(/<div\s+id="hns_body"[^>]*>([\s\S]*?)<\/div>\s*<div\s+id="hns_footer"/i);
  if (hnsMatch) return hnsMatch[1].trim();

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1].trim();

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    let content = bodyMatch[1];
    content = content.replace(/<header[\s\S]*?<\/header>/gi, "");
    content = content.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    content = content.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    return content.trim();
  }

  return html;
}

function extractSection(html: string, idOrTag: string): string {
  const idMatch = html.match(new RegExp(`<div\\s+id="${idOrTag}"[^>]*>([\\s\\S]*?)</div>`, "i"));
  if (idMatch) return idMatch[1].trim();

  const tagMatch = html.match(new RegExp(`<${idOrTag}[^>]*>([\\s\\S]*?)</${idOrTag}>`, "i"));
  if (tagMatch) return tagMatch[0].trim();
  return "";
}
