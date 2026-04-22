import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncTemplateFromSiteIfLinked } from "@/lib/template-sync";

// GET /api/sites/[id] — 사이트 상세 조회
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  return NextResponse.json(site);
}

// PUT /api/sites/[id] — 사이트 수정
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, published, languages, defaultLanguage, googleAnalyticsId, googleVerification, headerHtml, menuHtml, footerHtml, hmfLang } = body;

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    return NextResponse.json(
      { error: "사이트 이름은 필수입니다." },
      { status: 400 }
    );
  }

  // languages 유효성 검사
  const validLangs = ["ko", "en", "ja", "zh-cn", "zh-tw", "es"];
  if (languages !== undefined) {
    if (!Array.isArray(languages) || languages.length === 0) {
      return NextResponse.json(
        { error: "최소 1개 이상의 언어가 필요합니다." },
        { status: 400 }
      );
    }
    const invalid = languages.filter((l: string) => !validLangs.includes(l));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `지원하지 않는 언어: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
  }

  if (defaultLanguage !== undefined) {
    const targetLangs = languages || site.languages;
    if (!targetLangs.includes(defaultLanguage)) {
      return NextResponse.json(
        { error: "기본 언어는 지원 언어 목록에 포함되어야 합니다." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.site.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(published !== undefined && { published: !!published }),
      ...(languages !== undefined && { languages }),
      ...(defaultLanguage !== undefined && { defaultLanguage }),
      ...(googleAnalyticsId !== undefined && { googleAnalyticsId: googleAnalyticsId?.trim() || null }),
      ...(googleVerification !== undefined && { googleVerification: googleVerification?.trim() || null }),
    },
  });

  // Update HMF (header/menu/footer) per language if provided
  if (hmfLang && (headerHtml !== undefined || menuHtml !== undefined || footerHtml !== undefined)) {
    const hmfData: Record<string, string> = {};
    if (headerHtml !== undefined) hmfData.headerHtml = headerHtml;
    if (menuHtml !== undefined) hmfData.menuHtml = menuHtml;
    if (footerHtml !== undefined) hmfData.footerHtml = footerHtml;

    await prisma.siteHmf.upsert({
      where: { siteId_lang: { siteId: id, lang: hmfLang } },
      update: hmfData,
      create: { siteId: id, lang: hmfLang, ...hmfData },
    });
  }

  // Auto-sync: if this site is a template-storage clone, push the fresh
  // HMF + page snapshot back to the owning Template row so new sites
  // created from the template pick up the edit. No-op for regular sites.
  let templateSync: Awaited<ReturnType<typeof syncTemplateFromSiteIfLinked>> = null;
  try {
    templateSync = await syncTemplateFromSiteIfLinked(id);
  } catch (e) {
    console.error("[template-sync] site save auto-sync failed:", e);
  }

  return NextResponse.json({ ...updated, templateSync });
}

// DELETE /api/sites/[id] — 사이트 삭제
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  await prisma.site.delete({ where: { id } });

  return NextResponse.json({ message: "사이트가 삭제되었습니다." });
}
