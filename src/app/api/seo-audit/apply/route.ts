/**
 * Apply autofix-tagged findings from a previously stored audit.
 * Free — no credit interaction. The findings themselves came from a
 * paid audit run, so the user has already paid for the analysis.
 *
 *   POST /api/seo-audit/apply
 *   body: { siteId: string, fixes: [{ categoryKey, findingIndex }] }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyAutofixes, SeoAuditError, type FixRef } from "@/lib/seo-audit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: { siteId?: string; fixes?: FixRef[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const siteId = (body.siteId || "").trim();
  const fixes = Array.isArray(body.fixes) ? body.fixes : [];
  if (!siteId || fixes.length === 0) {
    return NextResponse.json({ error: "siteId와 적용할 항목이 필요합니다." }, { status: 400 });
  }

  // Authorize: site owner or admin
  const [site, me] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, userId: true, isTemplateStorage: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }),
  ]);
  if (!site) return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  if (site.isTemplateStorage) {
    return NextResponse.json({ error: "템플릿 보관용 사이트는 적용할 수 없습니다." }, { status: 400 });
  }
  if (me?.role !== "ADMIN" && site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const out = await applyAutofixes(site.id, fixes);
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    if (err instanceof SeoAuditError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[seo-audit/apply] failed:", err);
    return NextResponse.json({ error: "적용 중 오류가 발생했습니다." }, { status: 500 });
  }
}
