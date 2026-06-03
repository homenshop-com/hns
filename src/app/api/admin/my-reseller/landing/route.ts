import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/admin-access";
import {
  getLandingState,
  linkResellerLanding,
  unlinkResellerLanding,
} from "@/lib/reseller-landing";

/**
 * Self-service landing-page link for a reseller operator.
 *
 * Operates strictly on the caller's OWN reseller (admin-access.resellerId) and
 * may only link a Site the caller OWNS (validated in linkResellerLanding via
 * the caller's userId). Domain, revenue-share, etc. stay platform-admin-only.
 */

async function requireResellerAccess() {
  const access = await getAdminAccess();
  if (!access) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (access.kind !== "reseller") {
    return {
      error: NextResponse.json(
        { error: "리셀러 운영자 전용 페이지입니다." },
        { status: 403 }
      ),
    };
  }
  return { access };
}

export async function GET() {
  const guard = await requireResellerAccess();
  if ("error" in guard) return guard.error;
  const { access } = guard;

  const state = await getLandingState(access.resellerId);
  if (!state) {
    return NextResponse.json({ error: "리셀러를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const guard = await requireResellerAccess();
  if ("error" in guard) return guard.error;
  const { access } = guard;

  const body = await request.json().catch(() => ({}));
  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (!siteId) {
    return NextResponse.json({ error: "사이트를 선택해주세요." }, { status: 400 });
  }

  // expectedOwner = the caller (a reseller operator can only link own sites).
  const result = await linkResellerLanding(access.resellerId, siteId, access.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ landingSite: result.landingSite });
}

export async function DELETE() {
  const guard = await requireResellerAccess();
  if ("error" in guard) return guard.error;
  const { access } = guard;

  const result = await unlinkResellerLanding(access.resellerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
