import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * One-shot endpoint: parse the site's headerHtml <nav> hash-anchor links
 * (#event, #wedding, …) and inject each as a Page row with
 * menuType="external" so they appear in 메뉴관리. Mirrors the auto-inject
 * step in /api/templates/from-claude-zip — useful for sites that were
 * created before that auto-inject was wired in.
 *
 * Auth: site owner only. Idempotent (skips slugs that already exist).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headerHtml = site.headerHtml || "";
  const lang = site.defaultLanguage || "ko";

  const navMatch = /<nav\b[^>]*>([\s\S]*?)<\/nav>/i.exec(headerHtml);
  if (!navMatch) {
    return NextResponse.json({ ok: true, injected: 0, reason: "no <nav> in headerHtml" });
  }

  const linkRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = Array.from(navMatch[1].matchAll(linkRe));
  if (matches.length === 0) {
    return NextResponse.json({ ok: true, injected: 0, reason: "no <a> in nav" });
  }
  const allHash = matches.every((m) => m[1].trim().startsWith("#"));
  if (!allHash) {
    return NextResponse.json({ ok: true, injected: 0, reason: "nav has non-hash links" });
  }

  // Determine startSortOrder from existing pages
  const maxPage = await prisma.page.findFirst({
    where: { siteId: id, lang },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let order = (maxPage?.sortOrder ?? -1) + 1;

  const usedSlugs = new Set<string>();
  let injected = 0;
  const items: { title: string; slug: string; href: string }[] = [];

  for (const m of matches) {
    const href = m[1].trim();
    const rawLabel = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (!rawLabel) continue;

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
      where: { siteId_slug_lang: { siteId: id, slug, lang } },
    });
    if (existing) continue;

    await prisma.page.create({
      data: {
        siteId: id,
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
    items.push({ title: rawLabel.slice(0, 100), slug, href });
  }

  return NextResponse.json({ ok: true, injected, items });
}
