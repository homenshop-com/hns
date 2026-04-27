import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";
import { shopifyAdapter } from "@/lib/marketplaces/shopify";

/**
 * Shopify OAuth callback handler.
 *
 * Flow:
 *   1. /dashboard/integrations → user enters their shop domain.
 *   2. Server builds the install URL with state=siteId=<siteId>.
 *   3. Shopify redirects here with ?code=...&shop=...&state=siteId=<siteId>.
 *   4. We exchange the code for an access token and store it as a
 *      MarketplaceIntegration row.
 *   5. Redirect to /dashboard/integrations?connected=shopify.
 *
 * We don't validate the HMAC param here (this is a side-by-side adapter,
 * not a Shopify embedded app). For an embedded-app deployment, add the
 * `hmac` verification step before exchanging the code.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state") || "";

  if (!code || !shop) {
    return NextResponse.json(
      { error: "missing code/shop" },
      { status: 400 },
    );
  }

  // state was URL-encoded as "siteId=<id>"
  const siteIdMatch = decodeURIComponent(state).match(/siteId=([\w-]+)/);
  const siteId = siteIdMatch?.[1];
  if (!siteId) {
    return NextResponse.json({ error: "missing siteId in state" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true },
  });
  if (!site) {
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  const redirectUri = `${request.nextUrl.origin}/api/integrations/shopify/callback`;
  let creds;
  try {
    const result = await shopifyAdapter.exchangeCode!(code, redirectUri, { shop });
    creds = result.credentials;
  } catch (err) {
    return NextResponse.json(
      { error: "OAuth exchange failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  await prisma.marketplaceIntegration.upsert({
    where: { siteId_channel: { siteId, channel: "SHOPIFY" } },
    update: {
      credentials: encryptJson(creds),
      status: "ACTIVE",
      lastError: null,
    },
    create: {
      siteId,
      channel: "SHOPIFY",
      credentials: encryptJson(creds),
      status: "ACTIVE",
    },
  });

  return NextResponse.redirect(
    `${request.nextUrl.origin}/dashboard/integrations?connected=shopify`,
  );
}
