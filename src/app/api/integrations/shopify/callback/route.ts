import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";
import { shopifyAdapter } from "@/lib/marketplaces/shopify";

/**
 * Shopify OAuth callback handler.
 *
 * Multi-account flow:
 *   1. /dashboard/integrations → user enters label + shop domain.
 *   2. /api/integrations/shopify/install POST creates a placeholder
 *      MarketplaceIntegration with status=DISCONNECTED and returns the
 *      Shopify install URL with state=integrationId=<placeholder.id>.
 *   3. Shopify redirects here with ?code=...&shop=...&state=integrationId=<id>.
 *   4. We exchange the code for an access token and UPDATE that specific
 *      integration row (preserving the user's label, allowing multiple
 *      shops on the same site).
 *   5. Redirect to /dashboard/integrations?siteId=<siteId>.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state") || "";

  if (!code || !shop) {
    return NextResponse.json({ error: "missing code/shop" }, { status: 400 });
  }

  const integrationIdMatch = decodeURIComponent(state).match(/integrationId=([\w-]+)/);
  const integrationId = integrationIdMatch?.[1];
  if (!integrationId) {
    return NextResponse.json(
      { error: "missing integrationId in state" },
      { status: 400 },
    );
  }

  const integration = await prisma.marketplaceIntegration.findUnique({
    where: { id: integrationId },
    select: { id: true, channel: true, userId: true, siteId: true },
  });
  if (!integration || integration.channel !== "SHOPIFY") {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const redirectUri = `${request.nextUrl.origin}/api/integrations/shopify/callback`;
  let creds;
  try {
    const result = await shopifyAdapter.exchangeCode!(code, redirectUri, { shop });
    creds = result.credentials;
  } catch (err) {
    await prisma.marketplaceIntegration.update({
      where: { id: integrationId },
      data: {
        status: "ERROR",
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json(
      {
        error: "OAuth exchange failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  await prisma.marketplaceIntegration.update({
    where: { id: integrationId },
    data: {
      credentials: encryptJson(creds),
      displayName: shop,
      status: "ACTIVE",
      lastError: null,
    },
  });

  return NextResponse.redirect(
    `${request.nextUrl.origin}/dashboard/integrations?connected=shopify`,
  );
}
