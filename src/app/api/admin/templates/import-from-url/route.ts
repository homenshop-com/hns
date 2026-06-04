/**
 * POST /api/admin/templates/import-from-url
 *
 * Capture a *published* homeNshop site by URL and store it as a system
 * Template — the faithful "what the customer sees" snapshot. Built for the
 * account-restore case where the design editor and the published page have
 * drifted apart: the published render is authoritative, so we reconstruct
 * the template from the live HTML (header/menu/footer + CSS + per-page body)
 * with no scene-graph layers, guaranteeing the design doesn't break.
 *
 * Body: { url: string, mode: "ppt" | "responsive" }
 *   - "ppt"        → isResponsive:false, legacy absolute-coordinate layout
 *   - "responsive" → isResponsive:true,  HNS-MODERN-TEMPLATE marker prepended
 *
 * Auth: admin + template-editor allowlist (master@, design@).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditTemplates } from "@/lib/permissions";
import { capturePublishedAsTemplate, type CaptureMode } from "@/lib/published-to-template";

export const maxDuration = 120;

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

export async function POST(req: NextRequest) {
  const guard = await requireTemplateEditor();
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => null)) as { url?: string; mode?: string } | null;
  const url = (body?.url || "").trim();
  const mode: CaptureMode = body?.mode === "responsive" ? "responsive" : "ppt";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "http(s) URL 을 입력하세요." }, { status: 400 });
  }

  let captured;
  try {
    captured = await capturePublishedAsTemplate(url, mode);
  } catch (e) {
    console.error("[import-from-url] capture failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "캡처 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const stamp = Date.now().toString(36);
  const template = await prisma.template.create({
    data: {
      id: `tpl_url_${stamp}`,
      name: captured.name,
      path: `system/url-${captured.shopId}-${stamp}`,
      category: "imported",
      price: 0,
      keywords: `imported,url-capture,${captured.shopId}`,
      description:
        `퍼블리싱 URL 캡처: ${url}\n` +
        `${mode === "responsive" ? "반응형" : "PPT(레거시 절대좌표)"} 모드. ` +
        `관리자에서 기본정보·썸네일 수정 후 공개 전환하세요.`,
      isActive: true,
      isPublic: false,
      isResponsive: mode === "responsive",
      sortOrder: 0,
      headerHtml: captured.headerHtml,
      menuHtml: captured.menuHtml,
      footerHtml: captured.footerHtml,
      cssText: captured.cssText,
      userId: null,
      pagesSnapshot: captured.pagesSnapshot as unknown as object,
    },
  });

  return NextResponse.json({
    id: template.id,
    name: template.name,
    editUrl: `/admin/templates/${template.id}`,
    mode,
    stats: captured.stats,
  });
}
