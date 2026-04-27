import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/integrations/shopify/install
 *
 * Body: { siteId, shop }
 * Returns: { url } — the Shopify OAuth install URL the client should redirect to.
 *
 * Why a server endpoint (vs building the URL in the client): SHOPIFY_API_KEY
 * lives in env (not exposed to the browser), and we want to validate that
 * the caller actually owns the site before sending them through OAuth.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { siteId?: string; shop?: string };
  const { siteId, shop } = body;
  if (!siteId || !shop) {
    return NextResponse.json({ error: "siteId, shop required" }, { status: 400 });
  }

  // Allow either "yourstore.myshopify.com" or "yourstore" — normalize.
  const normalizedShop = shop.toLowerCase().trim().endsWith(".myshopify.com")
    ? shop.toLowerCase().trim()
    : `${shop.toLowerCase().trim()}.myshopify.com`;
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

  const scopes = process.env.SHOPIFY_SCOPES || "read_orders,read_products";
  const redirectUri = `${request.nextUrl.origin}/api/integrations/shopify/callback`;
  const state = encodeURIComponent(`siteId=${siteId}`);
  const url =
    `https://${normalizedShop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=`;

  return NextResponse.json({ url });
}
