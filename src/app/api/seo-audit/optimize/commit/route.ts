/**
 * Save a previously-previewed HTML optimization. Credits were charged at
 * the /optimize step (the Claude call), so this endpoint is free — it
 * just writes Page.content and marks addressed findings as applied.
 *
 *   POST /api/seo-audit/optimize/commit
 *   body: { siteId, pageId, patchedHtml, addressedFindings: [{categoryKey, findingIndex}] }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { commitOptimization, SeoAuditError, type FixRef } from "@/lib/seo-audit";

const MAX_HTML_BYTES = 1_000_000; // 1 MB hard cap on patched HTML

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: {
    siteId?: string;
    pageId?: string;
    patchedHtml?: string;
    addressedFindings?: FixRef[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const siteId = (body.siteId || "").trim();
  const pageId = (body.pageId || "").trim();
  const patchedHtml = body.patchedHtml || "";
  const addressed = Array.isArray(body.addressedFindings) ? body.addressedFindings : [];
  if (!siteId || !pageId || !patchedHtml) {
    return NextResponse.json({ error: "siteId, pageId, patchedHtml 모두 필요합니다." }, { status: 400 });
  }
  if (patchedHtml.length > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "패치 HTML이 너무 큽니다." }, { status: 413 });
  }

  const [site, me] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, userId: true, isTemplateStorage: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }),
  ]);
  if (!site) return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  if (site.isTemplateStorage) {
    return NextResponse.json({ error: "템플릿 보관용 사이트입니다." }, { status: 400 });
  }
  if (me?.role !== "ADMIN" && site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  try {
    await commitOptimization(siteId, pageId, patchedHtml, addressed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SeoAuditError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[seo-optimize/commit] failed:", err);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
