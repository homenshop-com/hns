import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBalance, CREDIT_COSTS } from "@/lib/credits";

export const dynamic = "force-dynamic";

/** GET /api/credits/balance — returns {balance, costs} for the current user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const balance = await getBalance(session.user.id);
  return NextResponse.json({
    balance,
    costs: {
      AI_SITE_CREATE: CREDIT_COSTS.AI_SITE_CREATE,
      AI_EDIT: CREDIT_COSTS.AI_EDIT,
      AI_OTHER: CREDIT_COSTS.AI_OTHER,
    },
  });
}
