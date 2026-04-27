import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/secrets";
import { getAdapter } from "@/lib/marketplaces/registry";
import { importOrders } from "@/lib/marketplaces/importer";
import type { MarketplaceCredentials } from "@/lib/marketplaces/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/marketplace-sync
 *
 * Polls every ACTIVE MarketplaceIntegration and imports new/updated orders.
 *
 * Schedule (suggested): every 10 minutes.
 *   `*\/10 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/marketplace-sync`
 *
 * Per-integration:
 *   - Skip if adapter.implemented === false (stubs).
 *   - Cursor: lastSyncAt - 1 hour overlap (catches late-arriving updates).
 *   - On success: update lastSyncAt to the cursor returned by the adapter.
 *   - On failure: write error to lastError, set status to ERROR, continue
 *     to the next integration (one bad token shouldn't stall the queue).
 *
 * Auth same as monthly-credits: Bearer CRON_SECRET or localhost.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "";
  if (expected && token !== expected && !isLocalhost) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.marketplaceIntegration.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      siteId: true,
      channel: true,
      lastSyncAt: true,
      credentials: true,
    },
  });

  const results: Array<{
    integrationId: string;
    siteId: string | null;
    channel: string;
    imported?: number;
    updated?: number;
    failed?: number;
    error?: string;
  }> = [];

  for (const integ of integrations) {
    const adapter = getAdapter(integ.channel);
    if (!adapter || !adapter.implemented) {
      results.push({
        integrationId: integ.id,
        siteId: integ.siteId,
        channel: integ.channel,
        error: "adapter not implemented",
      });
      continue;
    }

    try {
      const creds = decryptJson<MarketplaceCredentials>(integ.credentials);
      // 1-hour overlap so updates that arrive late don't slip past the cursor.
      const sinceMs =
        (integ.lastSyncAt?.getTime() ?? Date.now() - 7 * 24 * 60 * 60 * 1000) -
        60 * 60 * 1000;

      const { orders, cursor } = await adapter.listOrdersSince(creds, sinceMs);
      const summary = await importOrders(
        {
          userId: integ.userId,
          siteId: integ.siteId,
          channel: integ.channel,
          integrationId: integ.id,
        },
        orders,
      );

      await prisma.marketplaceIntegration.update({
        where: { id: integ.id },
        data: {
          lastSyncAt: new Date(cursor),
          lastError: null,
        },
      });

      results.push({
        integrationId: integ.id,
        siteId: integ.siteId,
        channel: integ.channel,
        ...summary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[marketplace-sync] ${integ.channel} (${integ.siteId}) failed:`,
        err,
      );
      await prisma.marketplaceIntegration.update({
        where: { id: integ.id },
        data: { status: "ERROR", lastError: message.slice(0, 1000) },
      });
      results.push({
        integrationId: integ.id,
        siteId: integ.siteId,
        channel: integ.channel,
        error: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    syncedAt: new Date().toISOString(),
    integrations: results,
  });
}
