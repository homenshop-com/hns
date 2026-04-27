import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/secrets";
import { importOrder } from "@/lib/marketplaces/importer";

/**
 * Shopify webhook receiver — orders/create, orders/updated, orders/cancelled.
 *
 * Multi-account aware: a single webhook URL serves all connected Shopify
 * shops for all sites. We look up the right integration by matching the
 * x-shopify-shop-domain header to a stored shop in any SHOPIFY-channel
 * MarketplaceIntegration row.
 *
 * Webhook setup (one-time per shop): see src/lib/marketplaces/shopify.ts
 * comments. Shopify signs each payload with HMAC-SHA256 keyed by the app's
 * shared secret; we verify before doing anything.
 */

export const dynamic = "force-dynamic";

function verifyHmac(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !hmacHeader) return false;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(hmacHeader);
  const b = Buffer.from(computed);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyHmac(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop domain" }, { status: 400 });
  }

  // Fast path: match by displayName (we set this to the shop domain on
  // OAuth callback, so it's already indexed by the lookup query). Falls
  // back to decrypting credentials if displayName is empty.
  const candidates = await prisma.marketplaceIntegration.findMany({
    where: { channel: "SHOPIFY", status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      siteId: true,
      displayName: true,
      credentials: true,
    },
  });

  type ShopifyCreds = { shop: string };
  let matched: typeof candidates[number] | null = null;
  for (const integ of candidates) {
    if (integ.displayName?.toLowerCase() === shopDomain.toLowerCase()) {
      matched = integ;
      break;
    }
  }
  if (!matched) {
    // displayName fallback: scan via decryption (older integrations).
    for (const integ of candidates) {
      try {
        const creds = decryptJson<ShopifyCreds>(integ.credentials);
        if (creds.shop?.toLowerCase() === shopDomain.toLowerCase()) {
          matched = integ;
          break;
        }
      } catch {
        // skip malformed
      }
    }
  }
  if (!matched) {
    // Webhook for a shop we're no longer connected to — accept silently.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const orderJson = JSON.parse(rawBody);
  const raw = orderJson as {
    id: number;
    name: string;
    created_at: string;
    total_price: string;
    financial_status: string;
    fulfillment_status: string | null;
    customer?: { id?: number; email?: string; phone?: string; first_name?: string; last_name?: string };
    shipping_address?: { name?: string; phone?: string; address1?: string; address2?: string; city?: string; province?: string; country?: string; zip?: string };
    note?: string;
    line_items: Array<{ id: number; variant_id?: number; sku?: string; title: string; quantity: number; price: string }>;
  };

  function mapStatus(financial: string, fulfillment: string | null) {
    if (fulfillment === "fulfilled") return "DELIVERED" as const;
    if (fulfillment === "partial" || fulfillment === "in_progress") return "SHIPPING" as const;
    if (financial === "refunded" || financial === "partially_refunded") return "REFUNDED" as const;
    if (financial === "voided") return "CANCELLED" as const;
    if (financial === "paid") return "PAID" as const;
    return "PENDING" as const;
  }

  const customerName = raw.customer
    ? [raw.customer.first_name, raw.customer.last_name].filter(Boolean).join(" ").trim()
    : undefined;

  await importOrder(
    {
      userId: matched.userId,
      siteId: matched.siteId,
      channel: "SHOPIFY",
      integrationId: matched.id,
    },
    {
      externalOrderId: String(raw.id),
      status: mapStatus(raw.financial_status, raw.fulfillment_status),
      totalAmount: Math.round(parseFloat(raw.total_price) * 100),
      shippingName: raw.shipping_address?.name ?? customerName ?? undefined,
      shippingPhone: raw.shipping_address?.phone ?? raw.customer?.phone ?? undefined,
      shippingAddr: raw.shipping_address
        ? [
            raw.shipping_address.country,
            raw.shipping_address.zip,
            raw.shipping_address.province,
            raw.shipping_address.city,
            raw.shipping_address.address1,
            raw.shipping_address.address2,
          ]
            .filter(Boolean)
            .join(" ")
        : undefined,
      shippingMemo: raw.note ?? undefined,
      customer: raw.customer
        ? {
            externalId: raw.customer.id ? String(raw.customer.id) : undefined,
            email: raw.customer.email,
            phone: raw.customer.phone,
            name: customerName || undefined,
          }
        : undefined,
      items: raw.line_items.map((li) => ({
        externalSku: li.variant_id ? String(li.variant_id) : (li.sku ?? String(li.id)),
        externalName: li.title,
        quantity: li.quantity,
        price: Math.round(parseFloat(li.price) * 100),
      })),
      placedAt: new Date(raw.created_at),
      raw,
    },
  );

  return NextResponse.json({ ok: true });
}
