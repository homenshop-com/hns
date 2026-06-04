/**
 * POST /api/admin/sites/create-from-template
 *
 * Admin (or reseller operator) creates a new Site for an EXISTING member
 * from a Template. Used by the member-detail page "템플릿으로 사이트 만들기"
 * button — typically to spin up a faithful copy of a published design (see
 * the URL-capture import flow) under a fresh account/shopId without touching
 * the member's existing site.
 *
 * Body: { templateId, userId, shopId, defaultLanguage? }
 *
 * Auth: getAdminAccess(). Reseller operators may only target members
 * attributed to their own reseller. No 5-free-site quota (admin override).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess } from "@/lib/admin-access";
import { instantiateSiteFromTemplate } from "@/lib/template-instantiate";

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    templateId?: string;
    userId?: string;
    shopId?: string;
    defaultLanguage?: string;
  } | null;

  const templateId = (body?.templateId || "").trim();
  const userId = (body?.userId || "").trim();
  const shopId = (body?.shopId || "").trim().toLowerCase();
  const defaultLanguage = (body?.defaultLanguage || "ko").trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, resellerId: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다." }, { status: 404 });
  }

  // Reseller operators can only create sites for their own members.
  if (access.kind === "reseller" && targetUser.resellerId !== access.resellerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await instantiateSiteFromTemplate({
    userId,
    templateId,
    shopId,
    defaultLanguage,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ site: result.site });
}
