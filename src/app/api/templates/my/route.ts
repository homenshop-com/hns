import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

const UPLOAD_BASE = process.env.UPLOAD_PATH || "/var/www/uploads";

// GET — List user's own templates
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.template.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ templates });
}

// POST — Create a new custom template from uploaded HTML/CSS
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const htmlFiles = formData.getAll("htmlFiles") as File[];
  const cssFile = formData.get("cssFile") as File | null;
  const assetFiles = formData.getAll("assets") as File[];

  if (!name?.trim()) {
    return NextResponse.json({ error: "템플릿 이름을 입력하세요." }, { status: 400 });
  }
  if (htmlFiles.length === 0) {
    return NextResponse.json({ error: "HTML 파일을 업로드하세요." }, { status: 400 });
  }

  // Generate unique template path
  const tplId = `user_${session.user.id}_${Date.now()}`;
  const tplPath = `user-templates/${tplId}`;
  const diskDir = path.join(UPLOAD_BASE, "templates", tplId);
  const filesDir = path.join(diskDir, "files");

  try {
    fs.mkdirSync(filesDir, { recursive: true });

    // Save HTML files
    const pageData: { slug: string; title: string; bodyHtml: string }[] = [];
    for (const file of htmlFiles) {
      const fileName = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(diskDir, fileName), buffer);

      // Extract body content from HTML
      const html = buffer.toString("utf-8");
      const bodyHtml = extractBody(html);
      const slug = fileName.replace(".html", "");
      const title = slug === "index" ? "HOME" : slug.charAt(0).toUpperCase() + slug.slice(1);
      pageData.push({ slug, title, bodyHtml });
    }

    // Sort: index first
    pageData.sort((a, b) => {
      if (a.slug === "index") return -1;
      if (b.slug === "index") return 1;
      return a.slug.localeCompare(b.slug);
    });

    // Save CSS file
    let cssText = "";
    if (cssFile) {
      const cssBuffer = Buffer.from(await cssFile.arrayBuffer());
      fs.writeFileSync(path.join(filesDir, "default.css"), cssBuffer);
      cssText = cssBuffer.toString("utf-8");
      // Rewrite relative url() to absolute paths
      const baseUrl = `/uploads/templates/${tplId}/files`;
      cssText = cssText.replace(
        /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
        (_, filename) => `url(${baseUrl}/${filename})`
      );
    }

    // Save asset files (images, fonts, etc.)
    for (const asset of assetFiles) {
      const assetBuffer = Buffer.from(await asset.arrayBuffer());
      fs.writeFileSync(path.join(filesDir, asset.name), assetBuffer);
    }

    // Extract HMF from index.html if present
    const indexPage = pageData.find((p) => p.slug === "index");
    const indexHtml = htmlFiles.find((f) => f.name.toLowerCase() === "index.html");
    let headerHtml = "";
    let menuHtml = "";
    let footerHtml = "";
    if (indexHtml) {
      const fullHtml = Buffer.from(await indexHtml.arrayBuffer()).toString("utf-8");
      headerHtml = extractSection(fullHtml, "hns_header") || extractSection(fullHtml, "header") || "";
      menuHtml = extractSection(fullHtml, "hns_menu") || extractSection(fullHtml, "nav") || "";
      footerHtml = extractSection(fullHtml, "hns_footer") || extractSection(fullHtml, "footer") || "";
    }

    // Create Template record
    const template = await prisma.template.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        path: tplPath,
        cssText,
        headerHtml: headerHtml || null,
        menuHtml: menuHtml || null,
        footerHtml: footerHtml || null,
        category: "custom",
        isActive: true,
      },
    });

    return NextResponse.json({
      template,
      pages: pageData,
    }, { status: 201 });
  } catch (err) {
    console.error("Template upload error:", err);
    return NextResponse.json({ error: "템플릿 생성에 실패했습니다." }, { status: 500 });
  }
}

// DELETE — Remove user's own template
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Only allow deleting own templates
  const template = await prisma.template.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete disk files
  const tplId = template.path.replace("user-templates/", "");
  const diskDir = path.join(UPLOAD_BASE, "templates", tplId);
  if (fs.existsSync(diskDir)) {
    fs.rmSync(diskDir, { recursive: true, force: true });
  }

  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Extract body content — tries hns_body first, then <main>, then <body>
function extractBody(html: string): string {
  // Try hns_body (legacy format)
  const hnsMatch = html.match(/<div\s+id="hns_body"[^>]*>([\s\S]*?)<\/div>\s*<div\s+id="hns_footer"/i);
  if (hnsMatch) return hnsMatch[1].trim();

  // Try <main> tag
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1].trim();

  // Try full body content (between <body> and </body>), stripping header/nav/footer
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    let content = bodyMatch[1];
    // Strip header, nav, footer tags
    content = content.replace(/<header[\s\S]*?<\/header>/gi, "");
    content = content.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    content = content.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    return content.trim();
  }

  return html;
}

// Extract a section by id or tag name
function extractSection(html: string, idOrTag: string): string {
  // Try by id first
  const idMatch = html.match(new RegExp(`<div\\s+id="${idOrTag}"[^>]*>([\\s\\S]*?)</div>`, "i"));
  if (idMatch) return idMatch[1].trim();

  // Try by tag name
  const tagMatch = html.match(new RegExp(`<${idOrTag}[^>]*>([\\s\\S]*?)</${idOrTag}>`, "i"));
  if (tagMatch) return tagMatch[0].trim(); // Return full tag
  return "";
}
