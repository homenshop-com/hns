import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";

/**
 * POST /api/integrations/shopify/install
 *
 * Body: { label, shop, integrationId?, siteId? }
 *   integrationId: optional — when re-authing an existing integration.
 *   siteId: optional — associate with a homenshop site for unified
 *     inventory/customer management. Pure marketplace setups skip this.
 *
 * Returns: { url, integrationId }
 *
 * Multi-account flow (user-scoped):
 *   1. Create (or reuse) a placeholder MarketplaceIntegration row owned by
 *      the calling user, with status=DISCONNECTED and the user's label.
 *   2. Build the install URL with state=integrationId=<id>.
 *   3. After Shopify approves, the callback handler updates that
 *      specific integration row with the access token.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    label?: string;
    shop?: string;
    integrationId?: string;
    siteId?: string | null;
  };
  const { label, shop, integrationId, siteId } = body;
  if (!shop || !label?.trim()) {
    return NextResponse.json(
      { error: "label, shop required" },
      { status: 400 },
    );
  }

  // Allow either "yourstore.myshopify.com" or "yourstore" — normalize.
  const trimmed = shop.toLowerCase().trim();
  const normalizedShop = trimmed.endsWith(".myshopify.com")
    ? trimmed
    : `${trimmed}.myshopify.com`;
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(normalizedShop)) {
    return NextResponse.json(
      { error: "Invalid shop domain" },
      { status: 400 },
    );
  }

  // Validate site ownership if a site association was specified.
  if (siteId) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, userId: session.user.id },
      select: { id: true },
    });
    if (!site) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SHOPIFY_API_KEY not configured" },
      { status: 500 },
    );
  }

  let placeholderId: string;
  if (integrationId) {
    const existing = await prisma.marketplaceIntegration.findUnique({
      where: { id: integrationId },
      select: { userId: true },
    });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.marketplaceIntegration.update({
      where: { id: integrationId },
      data: {
        label: label.trim(),
        displayName: normalizedShop,
        siteId: siteId ?? null,
      },
    });
    placeholderId = integrationId;
  } else {
    const created = await prisma.marketplaceIntegration.create({
      data: {
        userId: session.user.id,
        siteId: siteId ?? null,
        channel: "SHOPIFY",
        label: label.trim(),
        displayName: normalizedShop,
        credentials: encryptJson({ pending: true }),
        status: "DISCONNECTED",
      },
    });
    placeholderId = created.id;
  }

  const scopes = process.env.SHOPIFY_SCOPES || "read_orders,read_products";
  const redirectUri = `${request.nextUrl.origin}/api/integrations/shopify/callback`;
  const state = encodeURIComponent(`integrationId=${placeholderId}`);
  const url =
    `https://${normalizedShop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=`;

  return NextResponse.json({ url, integrationId: placeholderId });
}
