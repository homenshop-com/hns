/**
 * AI 언급률(GEO Visibility) 측정.
 *
 *   POST /api/sites/:id/visibility   → 측정 1회 실행 (크레딧 차감)
 *   GET  /api/sites/:id/visibility   → 최근 측정 결과 조회
 *
 * 과금: 사이트 소유자는 CREDIT_COSTS.AI_VISIBILITY_CHECK 차감(원장 kind=AI_OTHER).
 * ADMIN은 무료. 실패 시 환불(단일 choke-point).
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
import {
  runVisibilityCheck,
  getLatestVisibilityRun,
  VisibilityError,
} from "@/lib/ai-visibility";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(id: string, userId: string) {
  const [site, me] = await Promise.all([
    prisma.site.findUnique({
      where: { id },
      select: { id: true, userId: true, isTemplateStorage: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  return { site, isAdmin: me?.role === "ADMIN" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const { site, isAdmin } = await authorize(id, session.user.id);
  if (!site) return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  if (!isAdmin && site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const run = await getLatestVisibilityRun(id);
  return NextResponse.json({ ok: true, run });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const { site, isAdmin } = await authorize(id, userId);
  if (!site) return NextResponse.json({ error: "사이트를 찾을 수 없습니다." }, { status: 404 });
  if (site.isTemplateStorage) {
    return NextResponse.json({ error: "템플릿 보관용 사이트는 측정할 수 없습니다." }, { status: 400 });
  }
  if (!isAdmin && site.userId !== userId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const cost = isAdmin ? 0 : CREDIT_COSTS.AI_VISIBILITY_CHECK;
  if (cost > 0) {
    try {
      await consumeCredits(userId, {
        kind: "AI_OTHER",
        amount: cost,
        refSiteId: site.id,
        aiModel: process.env.AI_VISIBILITY_MODEL || "claude-sonnet-4-6",
        description: "AI 언급률 측정",
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
          { status: 402 },
        );
      }
      console.error("[visibility] consume failed:", err);
      return NextResponse.json({ error: "크레딧 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  try {
    const run = await runVisibilityCheck(site.id, { creditsCharged: cost });
    const balanceAfter = await getBalance(userId);
    return NextResponse.json({ ok: true, run, creditsCharged: cost, balanceAfter });
  } catch (err) {
    if (cost > 0) {
      await refundCredits(userId, cost, {
        reason: err instanceof VisibilityError ? err.code : "visibility_failed",
        refSiteId: site.id,
      }).catch((e) => console.error("[visibility] refund failed:", e));
    }
    if (err instanceof VisibilityError) {
      const status = err.code === "not_found" ? 404 : err.code === "no_api_key" ? 503 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[visibility] failed:", err);
    return NextResponse.json({ error: "측정 중 오류가 발생했습니다." }, { status: 500 });
  }
}
