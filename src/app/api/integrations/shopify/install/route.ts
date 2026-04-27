import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";

/**
 * POST /api/integrations/shopify/install
 *
 * Body: { siteId, label, shop, integrationId? }
 *   integrationId: optional — when re-authing an existing integration.
 *
 * Returns: { url, integrationId }
 *
 * Multi-account flow:
 *   1. Create (or reuse) a placeholder MarketplaceIntegration row with
 *      status=DISCONNECTED, encrypted-empty credentials, the seller's
 *      label. This gives us an integrationId we can round-trip through
 *      the OAuth `state` param.
 *   2. Build the install URL with state=siteId=<id>:integrationId=<id>.
 *   3. After Shopify approves, the callback handler updates that
 *      specific integration row with the access token.
 *
 * Why not create-on-callback: the seller's label needs to be persisted
 * before the redirect, otherwise we'd lose it during the round-trip.
 * We could pass it through `state`, but state has size limits and the
 * label is user-supplied so it could be arbitrary text.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    siteId?: string;
    label?: string;
    shop?: string;
    integrationId?: string;
  };
  const { siteId, label, shop, integrationId } = body;
  if (!siteId || !shop || !label?.trim()) {
    return NextResponse.json(
      { error: "siteId, label, shop required" },
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

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id },
    select: { id: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SHOPIFY_API_KEY not configured" },
      { status: 500 },
    );
  }

  // Create or reuse the placeholder integration row.
  let placeholderId: string;
  if (integrationId) {
    const existing = await prisma.marketplaceIntegration.findUnique({
      where: { id: integrationId },
      include: { site: { select: { userId: true } } },
    });
    if (!existing || existing.site.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.marketplaceIntegration.update({
      where: { id: integrationId },
      data: { label: label.trim(), displayName: normalizedShop },
    });
    placeholderId = integrationId;
  } else {
    const created = await prisma.marketplaceIntegration.create({
      data: {
        siteId,
        channel: "SHOPIFY",
        label: label.trim(),
        displayName: normalizedShop,
        // Encrypt an empty placeholder so the column is never raw-empty.
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
