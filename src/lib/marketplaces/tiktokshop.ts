import type { MarketplaceAdapter } from "./types";

/**
 * TikTok Shop adapter — STUB.
 *
 * Auth: Standard OAuth via TikTok Open Platform.
 *   1. Register at https://partner.tiktokshop.com → "Open Platform".
 *   2. Get app_key / app_secret.
 *   3. Seller goes through OAuth → returns access_token + refresh_token + shop_id.
 *
 * Required credentials shape (when implemented):
 *   { appKey, appSecret, accessToken, refreshToken, shopId, shopCipher }
 *
 * Order endpoint:
 *   POST /api/orders/search
 *   Host: https://open-api.tiktokglobalshop.com
 *   Auth: query param `access_token` + signed query string.
 *   Signature: HMAC-SHA256(app_secret, sortedParams + body).
 *
 * Webhook events (alternative to polling):
 *   ORDER_STATUS_CHANGE → POST to /api/webhooks/tiktokshop
 *   Event payload includes order_id; pull full order via API.
 *
 * Status mapping:
 *   UNPAID → PENDING, AWAITING_SHIPMENT → PAID,
 *   AWAITING_COLLECTION/IN_TRANSIT → SHIPPING,
 *   DELIVERED → DELIVERED, COMPLETED → DELIVERED,
 *   CANCELLED → CANCELLED.
 *
 * Implementation notes for the next dev:
 *   - Region matters: TikTok Shop has separate clusters for US, SEA, EU.
 *     The base URL changes (open-api.tiktokglobalshop.com vs ...-eu.com).
 *   - access_token expires every 24h; refresh_token every 6 months.
 *   - shop_cipher is region-specific and required on every API call.
 *   - SKU = sku_id (numeric string).
 *
 * Why stub: requires Open Platform app approval (~5-10 business days)
 * and a real shop to test against.
 */
export const tiktokshopAdapter: MarketplaceAdapter = {
  channel: "TIKTOKSHOP",
  displayName: "TikTok Shop",
  implemented: false,

  async verifyCredentials() {
    return { ok: false, message: "TikTok Shop adapter not implemented yet" };
  },

  async listOrdersSince() {
    throw new Error("TikTok Shop adapter not implemented yet");
  },
};
