/**
 * Run an SEO/GEO audit for a site.
 *
 *   POST /api/seo-audit  body: { siteId: string }
 *
 * Auth/charge:
 *   · Site owner → consume CREDIT_COSTS.AI_SEO_AUDIT (5C); 402 if low.
 *   · ADMIN role → free (admin tooling). Detected by user.role.
 *
 * Returns the saved AuditResult plus { creditsCharged, balanceAfter }.
 * On AI/fetch failure after credit consumption, credits are refunded
 * before responding with an error (single choke-point at the bottom).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
  getBalance,
} from "@/lib/credits";
import { runSeoAudit, SeoAuditError } from "@/lib/seo-audit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { siteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const siteId = (body.siteId || "").trim();
  if (!siteId) {
    return NextResponse.json({ error: "siteId가 필요합니다." }, { status: 400 });
  }

  // Ownership / role check
  const [site, me] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, userId: true, isTemplateStorage: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  if (!site) {
    return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  }
  if (site.isTemplateStorage) {
    return NextResponse.json({ error: "템플릿 보관용 사이트는 진단할 수 없습니다." }, { status: 400 });
  }
  const isAdmin = me?.role === "ADMIN";
  if (!isAdmin && site.userId !== userId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  // Charge (skipped for admin)
  const cost = isAdmin ? 0 : CREDIT_COSTS.AI_SEO_AUDIT;
  if (cost > 0) {
    try {
      await consumeCredits(userId, {
        kind: "AI_SEO_AUDIT",
        amount: cost,
        refSiteId: site.id,
        aiModel: process.env.SEO_AUDIT_MODEL || "claude-sonnet-4-6",
        description: "SEO/GEO 진단",
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: `크레딧이 부족합니다. (필요: ${err.required} C, 잔액: ${err.balance} C)`,
            code: "INSUFFICIENT_CREDITS",
            balance: err.balance,
            required: err.required,
          },
          { status: 402 }
        );
      }
      console.error("[seo-audit] consume failed:", err);
      return NextResponse.json({ error: "크레딧 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  try {
    const result = await runSeoAudit(site.id, { creditsCharged: cost });
    const balanceAfter = await getBalance(userId);
    return NextResponse.json({
      ok: true,
      result,
      creditsCharged: cost,
      balanceAfter,
    });
  } catch (err) {
    if (cost > 0) {
      await refundCredits(userId, cost, {
        reason: err instanceof SeoAuditError ? err.code : "audit_failed",
        refSiteId: site.id,
      }).catch((e) => console.error("[seo-audit] refund failed:", e));
    }
    if (err instanceof SeoAuditError) {
      const status = err.code === "fetch_failed" ? 502 : err.code === "no_homepage" ? 404 : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[seo-audit] failed:", err);
    return NextResponse.json({ error: "진단 중 오류가 발생했습니다." }, { status: 500 });
  }
}
