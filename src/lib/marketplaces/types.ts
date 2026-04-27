import type { OrderChannel, OrderStatus } from "@/generated/prisma/client";

/**
 * Marketplace adapter contract.
 *
 * Each external marketplace (Shopify, Coupang, Amazon, etc.) implements
 * this interface. The cron sync route calls listOrdersSince() on every
 * ACTIVE integration; the OAuth/connect routes call exchangeCode() and
 * verifyCredentials().
 *
 * Adapters MUST NOT touch Prisma directly — they work in terms of
 * NormalizedOrder/Item objects, and the central importer (importOrders.ts)
 * is responsible for dedupe + Customer resolution + ProductChannelMapping
 * lookup. Keeps the adapters small and the storage logic uniform.
 */

export interface MarketplaceCredentials {
  /** Free-form bag — each adapter validates its own shape. Stored
   *  encrypted in MarketplaceIntegration.credentials. */
  [k: string]: unknown;
}

export interface NormalizedOrderItem {
  /** Marketplace's SKU/variant identifier. Used to look up
   *  ProductChannelMapping → internal Product. */
  externalSku: string;
  /** Display name from the marketplace, captured for UX even if the
   *  SKU isn't mapped to a homenshop Product yet. */
  externalName: string;
  quantity: number;
  /** Unit price in minor currency units (KRW won, USD cents, etc.).
   *  Adapter is responsible for normalizing currency. */
  price: number;
}

export interface NormalizedCustomer {
  /** Marketplace-specific buyer identifier (Coupang buyerLoginId,
   *  Shopify customer.id, etc.). Used to resolve repeat buyers. */
  externalId?: string;
  email?: string;
  phone?: string;
  name?: string;
}

export interface NormalizedOrder {
  externalOrderId: string;
  status: OrderStatus;
  totalAmount: number;
  currency?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingAddr?: string;
  shippingMemo?: string;
  customer?: NormalizedCustomer;
  items: NormalizedOrderItem[];
  /** Marketplace's order timestamp (when the buyer placed it).
   *  Falls back to "now" if the marketplace doesn't expose it. */
  placedAt: Date;
  /** Raw response — stored on Order.externalRawJson for replay/debug. */
  raw: unknown;
}

/** Result of a sync poll — orders to import + the cursor for next call. */
export interface SyncResult {
  orders: NormalizedOrder[];
  /** Unix ms of the latest order/event seen. Caller stores this on
   *  MarketplaceIntegration.lastSyncAt to bound the next poll. */
  cursor: number;
}

/** OAuth-style adapters return this from the connect callback. */
export interface OAuthExchangeResult {
  credentials: MarketplaceCredentials;
  /** Optional human-readable name (shop URL, vendor name) shown in the
   *  integrations dashboard so the user can tell their accounts apart. */
  displayName?: string;
}

export interface MarketplaceAdapter {
  channel: OrderChannel;
  /** Human-readable name for UI ("Shopify", "쿠팡 Wing"). */
  displayName: string;

  /** True if this adapter is fully implemented. Stub adapters return
   *  false; the integrations UI shows a "Coming soon" badge for them. */
  implemented: boolean;

  /** Validate that credentials still work — used on connect, and as
   *  a health probe by the cron. Returns a short message on failure. */
  verifyCredentials(creds: MarketplaceCredentials): Promise<{ ok: boolean; message?: string }>;

  /** Fetch orders placed/updated since the cursor. Cursor is unix ms. */
  listOrdersSince(creds: MarketplaceCredentials, sinceMs: number): Promise<SyncResult>;

  /** OAuth-style flows: where to send the user. Adapters that use
   *  static API keys (Coupang, Amazon SP-API, Qoo10) leave this null. */
  buildAuthUrl?(siteId: string, redirectUri: string): string;

  /** OAuth-style flows: exchange the callback code for credentials. */
  exchangeCode?(
    code: string,
    redirectUri: string,
    extra?: Record<string, string>,
  ): Promise<OAuthExchangeResult>;
}
