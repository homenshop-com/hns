/**
 * Tier 2 — ask Claude to rewrite the homepage HTML based on the stored
 * audit's non-autofix findings. Returns a PREVIEW only; the user must
 * call /commit to actually save it. Charge happens at preview time
 * (the API call is what costs money — refunded on Anthropic failure).
 *
 *   POST /api/seo-audit/optimize
 *   body: { siteId: string }
 *
 * Cost: CREDIT_COSTS.AI_SEO_OPTIMIZE (10C); ADMIN free.
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
import { optimizePageHtml, SeoAuditError } from "@/lib/seo-audit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { siteId?: string; pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const siteId = (body.siteId || "").trim();
  const pageId = (body.pageId || "").trim() || null;
  if (!siteId) {
    return NextResponse.json({ error: "siteId가 필요합니다." }, { status: 400 });
  }

  const [site, me] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, userId: true, isTemplateStorage: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  if (!site) return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  if (site.isTemplateStorage) {
    return NextResponse.json({ error: "템플릿 보관용 사이트는 최적화할 수 없습니다." }, { status: 400 });
  }
  const isAdmin = me?.role === "ADMIN";
  if (!isAdmin && site.userId !== userId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const cost = isAdmin ? 0 : CREDIT_COSTS.AI_SEO_OPTIMIZE;
  if (cost > 0) {
    try {
      await consumeCredits(userId, {
        kind: "AI_SEO_OPTIMIZE",
        amount: cost,
        refSiteId: site.id,
        aiModel: process.env.SEO_OPTIMIZE_MODEL || "claude-sonnet-4-6",
        description: "SEO/GEO HTML 최적화",
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
      console.error("[seo-optimize] consume failed:", err);
      return NextResponse.json({ error: "크레딧 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  try {
    const preview = await optimizePageHtml(site.id, { creditsCharged: cost, pageId });
    const balanceAfter = await getBalance(userId);
    return NextResponse.json({
      ok: true,
      preview,
      creditsCharged: cost,
      balanceAfter,
    });
  } catch (err) {
    if (cost > 0) {
      await refundCredits(userId, cost, {
        reason: err instanceof SeoAuditError ? err.code : "optimize_failed",
        refSiteId: site.id,
      }).catch((e) => console.error("[seo-optimize] refund failed:", e));
    }
    if (err instanceof SeoAuditError) {
      const status = err.code === "fetch_failed" ? 502 : err.code === "no_homepage" ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[seo-optimize] failed:", err);
    return NextResponse.json({ error: "최적화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
