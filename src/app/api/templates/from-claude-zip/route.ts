import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { freeSiteDefaults } from "@/lib/site-expiration";
import { atomizeBodyHtml } from "@/lib/atomic-transform";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

const UPLOAD_BASE = process.env.UPLOAD_PATH || "/var/www/uploads";
const SHOP_ID_REGEX = /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/;

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
  const createSite = formData.get("createSite") === "true";
  const shopId = ((formData.get("shopId") as string) ?? "").trim().toLowerCase();
  const defaultLanguage = ((formData.get("defaultLanguage") as string) ?? "ko").toString();
  const siteTitle = ((formData.get("siteTitle") as string) ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "템플릿 이름을 입력하세요." }, { status: 400 });
  }
  if (!zipFile) {
    return NextResponse.json({ error: "zip 파일을 업로드하세요." }, { status: 400 });
  }

  if (createSite) {
    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }
    if (!SHOP_ID_REGEX.test(shopId)) {
      return NextResponse.json({ error: "shopId format invalid" }, { status: 400 });
    }
    if (!siteTitle) {
      return NextResponse.json({ error: "siteTitle is required" }, { status: 400 });
    }
    const siteCount = await prisma.site.count({
      where: { userId: session.user.id, isTemplateStorage: false },
    });
    if (siteCount >= 5) {
      return NextResponse.json({ error: "Maximum sites reached" }, { status: 409 });
    }
    const existing = await prisma.site.findUnique({ where: { shopId } });
    if (existing) {
      return NextResponse.json({ error: "shopId already taken" }, { status: 409 });
    }
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
      const rawBody = extractBody(html);
      const slug = h.name.toLowerCase().replace(/\.html$/, "");
      // Atomize: wrap bare h1/h2/p/img/a.btn/ul/table in .dragable so the
      // design editor can select, label, and edit them. Without this,
      // user-uploaded HTML renders fine but is unselectable in the editor.
      const bodyHtml = atomizeBodyHtml(rawBody, slug);
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

    if (!createSite) {
      return NextResponse.json(
        {
          template,
          pages: pageData,
          stats: { html: htmls.length, css: csses.length, assets: assets.length },
        },
        { status: 201 },
      );
    }

    try {
      const site = await prisma.site.create({
        data: {
          userId: session.user.id,
          shopId,
          name: siteTitle,
          defaultLanguage,
          templateId: template.id,
          templatePath: template.path,
          headerHtml: template.headerHtml,
          menuHtml: template.menuHtml,
          footerHtml: template.footerHtml,
          cssText: template.cssText || null,
          ...freeSiteDefaults(),
          pages: {
            create: pageData.map((p, index) => ({
              title: p.title,
              slug: p.slug,
              lang: defaultLanguage,
              isHome: p.slug === "index",
              showInMenu: true,
              sortOrder: index,
              content: { html: p.bodyHtml } as Prisma.InputJsonValue,
            })),
          },
        },
        include: {
          pages: { orderBy: { sortOrder: "asc" } },
        },
      });

      // ── Inject single-page nav as menu items ─────────────────────────
      // When the zip's headerHtml has a <nav> with hash-anchor links
      // (#event, #wedding, …) — typical for Claude Designs single-page
      // exports — surface those as Page rows with menuType="external" so
      // they show up in 메뉴관리. Without this the user only sees "HOME"
      // there even though the published nav has 5+ section links.
      try {
        const injected = await injectNavAsMenuItems(
          site.id,
          defaultLanguage,
          template.headerHtml || "",
          pageData.length,
        );
        if (injected > 0) {
          console.log(`[from-claude-zip] injected ${injected} hash-anchor menu items for site ${site.id}`);
        }
      } catch (menuErr) {
        // Non-fatal — site already created successfully
        console.error("[from-claude-zip] menu inject failed (non-fatal):", menuErr);
      }

      return NextResponse.json(
        {
          template,
          site,
          stats: { html: htmls.length, css: csses.length, assets: assets.length },
        },
        { status: 201 },
      );
    } catch (siteErr) {
      console.error("[from-claude-zip] site creation failed, rolling back template:", siteErr);
      try {
        await prisma.template.delete({ where: { id: template.id } });
      } catch (delErr) {
        console.error("[from-claude-zip] template rollback failed:", delErr);
      }
      try {
        if (fs.existsSync(diskDir)) fs.rmSync(diskDir, { recursive: true, force: true });
      } catch {}
      return NextResponse.json(
        { error: "사이트 생성에 실패했습니다. 템플릿도 함께 롤백했습니다." },
        { status: 500 },
      );
    }
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

/**
 * Parse the <nav> inside headerHtml and inject each hash-anchor link
 * (#event, #wedding, …) as a Page row with menuType="external" so it
 * appears in 메뉴관리. Skips links with non-hash hrefs (those should be
 * real pages, not single-page section anchors).
 *
 * Returns the number of menu items inserted. Idempotent-ish: skips
 * slugs that already exist for the site/lang.
 */
async function injectNavAsMenuItems(
  siteId: string,
  lang: string,
  headerHtml: string,
  startSortOrder: number,
): Promise<number> {
  const navMatch = /<nav\b[^>]*>([\s\S]*?)<\/nav>/i.exec(headerHtml);
  if (!navMatch) return 0;

  const linkRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = Array.from(navMatch[1].matchAll(linkRe));
  if (matches.length === 0) return 0;

  // Only auto-inject when EVERY link is a hash anchor (single-page nav).
  // Mixed nav (real pages + anchors) would imply real pages — those should
  // come from htmls[] or be added manually.
  const allHash = matches.every((m) => m[1].trim().startsWith("#"));
  if (!allHash) return 0;

  let order = startSortOrder;
  const usedSlugs = new Set<string>();
  let injected = 0;

  for (const m of matches) {
    const href = m[1].trim();
    const rawLabel = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (!rawLabel) continue;

    // slug from hash (e.g. #wedding → "wedding"). Sanitize and dedupe.
    let baseSlug = href
      .slice(1)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!baseSlug) baseSlug = `nav-${order}`;
    let slug = baseSlug;
    let suffix = 1;
    while (usedSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;
    usedSlugs.add(slug);

    const existing = await prisma.page.findUnique({
      where: { siteId_slug_lang: { siteId, slug, lang } },
    });
    if (existing) continue;

    await prisma.page.create({
      data: {
        siteId,
        title: rawLabel.slice(0, 100),
        slug,
        lang,
        sortOrder: order++,
        menuType: "external",
        externalUrl: href,
        showInMenu: true,
        content: { html: "" } as Prisma.InputJsonValue,
      },
    });
    injected++;
  }

  return injected;
}

function extractSection(html: string, idOrTag: string): string {
  const idMatch = html.match(new RegExp(`<div\\s+id="${idOrTag}"[^>]*>([\\s\\S]*?)</div>`, "i"));
  if (idMatch) return idMatch[1].trim();

  const tagMatch = html.match(new RegExp(`<${idOrTag}[^>]*>([\\s\\S]*?)</${idOrTag}>`, "i"));
  if (tagMatch) return tagMatch[0].trim();
  return "";
}
