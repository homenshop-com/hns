import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageSite } from "@/lib/site-access";
import { rewriteAssetUrls } from "@/lib/template-parser";

/**
 * GET /api/sites/[id]/hmf?lang=xx
 *
 * Returns the CURRENT (server-side, asset-rewritten) header / menu / footer
 * HTML for a language — exactly how the editor page-load resolves them
 * (SiteHmf override → Site fallback, then rewriteAssetUrls). Used by the
 * editor to (C) re-fetch the freshest site-wide HMF when the user enters
 * "헤더/푸터 편집" mode, so concurrent edits from another tab/page are picked
 * up instead of editing a stale copy.
 *
 * Asset rewriting must run server-side (template-parser imports `fs`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canManageSite(id))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "";

  const site = await prisma.site.findUnique({
    where: { id },
    select: {
      defaultLanguage: true,
      templatePath: true,
      headerHtml: true,
      menuHtml: true,
      footerHtml: true,
      hmfTranslations: true,
    },
  });
  if (!site) {
    return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  }

  // Mirror the editor page-load resolution (page.tsx): per-lang SiteHmf wins,
  // else the default-language SiteHmf, else the Site-level fallback.
  const hmf =
    site.hmfTranslations?.find((h) => h.lang === lang) ||
    site.hmfTranslations?.find((h) => h.lang === site.defaultLanguage);
  let headerHtml = hmf?.headerHtml ?? site.headerHtml ?? "";
  let menuHtml = hmf?.menuHtml || site.menuHtml || "";
  let footerHtml = hmf?.footerHtml ?? site.footerHtml ?? "";

  const templatePath = site.templatePath || "";
  if (templatePath) {
    headerHtml = rewriteAssetUrls(headerHtml, templatePath);
    menuHtml = rewriteAssetUrls(menuHtml, templatePath);
    footerHtml = rewriteAssetUrls(footerHtml, templatePath);
  }

  return NextResponse.json(
    { lang: lang || site.defaultLanguage, headerHtml, menuHtml, footerHtml },
    { headers: { "Cache-Control": "no-store" } },
  );
}
