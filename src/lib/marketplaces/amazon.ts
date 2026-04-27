import type { MarketplaceAdapter } from "./types";

/**
 * Amazon Selling Partner API (SP-API) adapter — STUB.
 *
 * Auth: LWA (Login with Amazon) OAuth + AWS Sig V4 signing.
 *   Most complex of the six. Required steps:
 *     1. Register the app in Seller Central → "Develop apps".
 *     2. Get LWA client_id / client_secret.
 *     3. Seller goes through OAuth consent → returns refresh_token.
 *     4. Every API call: exchange refresh_token → access_token,
 *        AND sign with AWS Sig V4 using IAM role credentials.
 *
 * Required credentials shape (when implemented):
 *   { lwaClientId, lwaClientSecret, refreshToken, awsAccessKey,
 *     awsSecretKey, roleArn, sellerId, marketplaceId, region }
 *
 * Order endpoint:
 *   GET /orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=...
 *
 * Status mapping:
 *   Pending → PENDING, Unshipped/PartiallyShipped → PAID,
 *   Shipped → SHIPPING, Canceled → CANCELLED, etc.
 *
 * Implementation notes for the next dev:
 *   - SDK option: @sp-api-sdk/orders-api-v0 (Node) handles signing.
 *   - Refresh token is long-lived; access_token is 1h — cache it.
 *   - Marketplace IDs are constants per region (US: ATVPDKIKX0DER, JP: A1VC38T7YXB528).
 *   - Rate limit: 0.0167 req/s (=6/min) for orders. Batch carefully.
 *
 * Why stub: needs a real Seller Central account + IAM role; can't test
 * without that. Most operationally complex of the six adapters.
 */
export const amazonAdapter: MarketplaceAdapter = {
  channel: "AMAZON",
  displayName: "Amazon",
  implemented: false,

  async verifyCredentials() {
    return { ok: false, message: "Amazon SP-API adapter not implemented yet" };
  },

  async listOrdersSince() {
    throw new Error("Amazon SP-API adapter not implemented yet");
  },
};
