import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  NormalizedOrder,
  OAuthExchangeResult,
  SyncResult,
} from "./types";
import type { OrderStatus } from "@/generated/prisma/client";

/**
 * Shopify adapter — full reference implementation.
 *
 * Auth flow: standard OAuth (offline access).
 *   1. buildAuthUrl(siteId) → user installs the app on their shop.
 *   2. Shopify redirects to /api/integrations/shopify/callback with a
 *      `code` and `shop` (foo.myshopify.com).
 *   3. exchangeCode() POSTs to https://{shop}/admin/oauth/access_token
 *      and stores the resulting access token + shop URL as credentials.
 *
 * Order sync: GET /admin/api/2024-10/orders.json with updated_at_min cursor.
 *   - Polling-based; webhook receiver is an optional Phase-2 enhancement.
 *   - Pagination uses Link headers (cursor-based, "rel=next").
 *
 * Required env:
 *   SHOPIFY_API_KEY, SHOPIFY_API_SECRET — from your Partners account.
 *   SHOPIFY_SCOPES = "read_orders,read_products,write_products" (etc.)
 *   APP_BASE_URL — e.g. https://homenshop.com (for redirect_uri).
 */

const API_VERSION = "2024-10";

interface ShopifyCreds extends MarketplaceCredentials {
  shop: string; // foo.myshopify.com
  accessToken: string;
  scope?: string;
}

function isShopifyCreds(c: MarketplaceCredentials): c is ShopifyCreds {
  return typeof c.shop === "string" && typeof c.accessToken === "string";
}

function mapShopifyStatus(financial: string, fulfillment: string | null): OrderStatus {
  if (fulfillment === "fulfilled") return "DELIVERED";
  if (fulfillment === "partial" || fulfillment === "in_progress") return "SHIPPING";
  if (financial === "refunded" || financial === "partially_refunded") return "REFUNDED";
  if (financial === "voided") return "CANCELLED";
  if (financial === "paid") return "PAID";
  return "PENDING";
}

interface ShopifyOrderRaw {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  customer?: {
    id?: number;
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
  };
  shipping_address?: {
    name?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
  note?: string;
  line_items: Array<{
    id: number;
    variant_id?: number;
    sku?: string;
    title: string;
    quantity: number;
    price: string;
  }>;
}

function joinAddress(a?: ShopifyOrderRaw["shipping_address"]): string | undefined {
  if (!a) return undefined;
  return [a.country, a.zip, a.province, a.city, a.address1, a.address2]
    .filter(Boolean)
    .join(" ");
}

function normalizeShopifyOrder(raw: ShopifyOrderRaw): NormalizedOrder {
  const totalMinor = Math.round(parseFloat(raw.total_price) * 100);
  const customerName = raw.customer
    ? [raw.customer.first_name, raw.customer.last_name].filter(Boolean).join(" ").trim()
    : undefined;
  return {
    externalOrderId: String(raw.id),
    status: mapShopifyStatus(raw.financial_status, raw.fulfillment_status),
    totalAmount: totalMinor,
    currency: raw.currency,
    shippingName: raw.shipping_address?.name ?? customerName ?? undefined,
    shippingPhone: raw.shipping_address?.phone ?? raw.customer?.phone ?? undefined,
    shippingAddr: joinAddress(raw.shipping_address),
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
  };
}

async function shopifyFetch(
  shop: string,
  token: string,
  path: string,
): Promise<{ data: unknown; nextLink: string | null }> {
  const url = path.startsWith("https://")
    ? path
    : `https://${shop}/admin/api/${API_VERSION}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  // Cursor-based pagination via Link header: <…&page_info=XYZ>; rel="next"
  const link = res.headers.get("link");
  const nextLink =
    link?.match(/<([^>]+)>;\s*rel="next"/i)?.[1] ?? null;
  return { data, nextLink };
}

export const shopifyAdapter: MarketplaceAdapter = {
  channel: "SHOPIFY",
  displayName: "Shopify",
  implemented: true,

  buildAuthUrl(siteId: string, redirectUri: string): string {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const scopes = process.env.SHOPIFY_SCOPES || "read_orders,read_products";
    if (!apiKey) {
      throw new Error("SHOPIFY_API_KEY env var not set");
    }
    // The shop domain is collected separately (the user types
    // foo.myshopify.com on the connect page). siteId is round-tripped
    // through the `state` param.
    const state = encodeURIComponent(`siteId=${siteId}`);
    return `https://{SHOP_PLACEHOLDER}/admin/oauth/authorize?client_id=${apiKey}&scope=${encodeURIComponent(
      scopes,
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&grant_options[]=`;
  },

  async exchangeCode(
    code: string,
    _redirectUri: string,
    extra?: Record<string, string>,
  ): Promise<OAuthExchangeResult> {
    const shop = extra?.shop;
    if (!shop) throw new Error("Missing `shop` query param in callback");
    if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) {
      throw new Error(`Invalid shop domain: ${shop}`);
    }
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("SHOPIFY_API_KEY / SHOPIFY_API_SECRET not configured");
    }
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      }),
    });
    if (!res.ok) {
      throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string; scope: string };
    return {
      credentials: {
        shop,
        accessToken: json.access_token,
        scope: json.scope,
      } satisfies ShopifyCreds,
      displayName: shop,
    };
  },

  async verifyCredentials(creds: MarketplaceCredentials) {
    if (!isShopifyCreds(creds)) {
      return { ok: false, message: "Missing shop / accessToken" };
    }
    try {
      await shopifyFetch(creds.shop, creds.accessToken, "shop.json");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  async listOrdersSince(
    creds: MarketplaceCredentials,
    sinceMs: number,
  ): Promise<SyncResult> {
    if (!isShopifyCreds(creds)) {
      throw new Error("Invalid Shopify credentials");
    }
    const sinceIso = new Date(sinceMs).toISOString();
    let path: string | null = `orders.json?status=any&updated_at_min=${encodeURIComponent(
      sinceIso,
    )}&limit=100`;
    const collected: NormalizedOrder[] = [];
    let cursor = sinceMs;
    // Bounded pagination: stop after 50 pages (5000 orders) to keep one
    // sync batch reasonable; the next cron tick picks up the remainder.
    for (let page = 0; page < 50 && path; page++) {
      const { data, nextLink } = await shopifyFetch(creds.shop, creds.accessToken, path);
      const body = data as { orders: ShopifyOrderRaw[] };
      for (const raw of body.orders ?? []) {
        const normalized = normalizeShopifyOrder(raw);
        collected.push(normalized);
        cursor = Math.max(cursor, new Date(raw.updated_at).getTime());
      }
      path = nextLink;
    }
    return { orders: collected, cursor };
  },
};
