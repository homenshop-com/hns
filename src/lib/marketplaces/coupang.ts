import type { MarketplaceAdapter } from "./types";

/**
 * Coupang Wing (오픈마켓) adapter — STUB.
 *
 * Auth: Static API key + secret pair, signed per-request with HMAC-SHA256.
 * Vendor must register at https://wing.coupang.com and approve API access.
 *
 * Required credentials shape (when implemented):
 *   { vendorId: string, accessKey: string, secretKey: string }
 *
 * Order endpoint:
 *   GET /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets
 *   ?createdAtFrom=YYYY-MM-DDTHH:mm:ss&createdAtTo=...
 *   Auth header: HMAC-SHA256(method + path + query + datetime, secretKey)
 *
 * Status mapping:
 *   ACCEPT → PENDING, INSTRUCT → PAID, DEPARTURE/DELIVERING → SHIPPING,
 *   FINAL_DELIVERY → DELIVERED, RETURNS_REQUESTED/RETURNED → REFUNDED,
 *   CANCEL → CANCELLED.
 *
 * Implementation notes for the next dev:
 *   - HMAC signature lib: write inline with node:crypto.createHmac.
 *   - Coupang's datetime is "YYMMDD'T'HHmmss'Z'" (note 2-digit year).
 *   - Pagination is offset-based (page=N, perPage=50, hard limit 50).
 *   - SKU = vendorItemId (for syncing inventory & matching ProductChannelMapping).
 *
 * Why stub: full implementation needs a real Coupang vendor account for
 * testing — without that we can't validate the HMAC signing. The schema
 * and UI are ready; only this file needs filling in.
 */
export const coupangAdapter: MarketplaceAdapter = {
  channel: "COUPANG",
  displayName: "쿠팡 Wing",
  implemented: false,

  async verifyCredentials() {
    return { ok: false, message: "Coupang adapter not implemented yet" };
  },

  async listOrdersSince() {
    throw new Error("Coupang adapter not implemented yet");
  },
};
