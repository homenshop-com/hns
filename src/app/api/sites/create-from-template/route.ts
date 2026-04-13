import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseTemplatePages,
  readTemplateCss,
  rewriteAssetUrls,
} from "@/lib/template-parser";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId, shopId, defaultLanguage } = await request.json();
  if (!templateId) {
    return NextResponse.json(
      { error: "templateId is required" },
      { status: 400 }
    );
  }
  if (!shopId) {
    return NextResponse.json(
      { error: "shopId is required" },
      { status: 400 }
    );
  }

  // Validate shopId format: 6-14 chars, start/end with alphanumeric, allow hyphens
  if (!/^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(shopId)) {
    return NextResponse.json(
      { error: "shopId format invalid" },
      { status: 400 }
    );
  }

  // Check free site limit (max 5)
  const siteCount = await prisma.site.count({
    where: { userId: session.user.id },
  });

  if (siteCount >= 50) {
    return NextResponse.json(
      { error: "Maximum 5 free sites allowed" },
      { status: 409 }
    );
  }

  // Check if shopId is already taken
  const existingShop = await prisma.site.findUnique({
    where: { shopId },
  });

  if (existingShop) {
    return NextResponse.json(
      { error: "shopId already taken" },
      { status: 409 }
    );
  }

  // Get the template
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template || !template.isActive) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  // Custom template (userId present) — CSS/HMF already in DB
  // Public template — read from disk
  const isCustom = !!template.userId;
  const templatePages = parseTemplatePages(template.path);
  const templateCss = isCustom ? (template.cssText || "") : readTemplateCss(template.path);

  // Build page creation data from parsed template HTML
  const pageData = templatePages.map((page, index) => {
    const bodyHtml = rewriteAssetUrls(page.bodyHtml, template.path);
    return {
      title: page.title,
      slug: page.slug,
      isHome: page.slug === "index",
      showInMenu: page.showInMenu !== false,
      sortOrder: index,
      content: { html: bodyHtml },
    };
  });

  // Create site with template content
  const site = await prisma.site.create({
    data: {
      userId: session.user.id,
      shopId,
      name: template.name,
      defaultLanguage: defaultLanguage || "ko",
      templateId: template.id,
      templatePath: template.path,
      headerHtml: template.headerHtml || null,
      menuHtml: template.menuHtml || null,
      footerHtml: template.footerHtml || null,
      cssText: templateCss || null,
      pages: {
        create: pageData,
      },
    },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  // Increment template click count
  await prisma.template.update({
    where: { id: templateId },
    data: { clicks: { increment: 1 } },
  });

  return NextResponse.json({ site });
}
