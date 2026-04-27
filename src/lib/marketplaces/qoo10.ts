import type { MarketplaceAdapter } from "./types";

/**
 * Qoo10 (QSM) adapter — STUB.
 *
 * Auth: API certificate (.pem) + API key issued from QSM.
 *   Seller logs into QSM → 통합관리 → API Setup, generates a key.
 *
 * Required credentials shape (when implemented):
 *   { apiKey, apiSecret, sellerId }
 *
 * Order endpoint:
 *   POST https://api.qoo10.com/GMKT.INC.Front.QAPIService/ebayjapan.qapi/...
 *   Returns SOAP-style XML (legacy). Modern endpoint:
 *   POST https://api.qoo10.jp/api/Item/SendInventory
 *   For orders: ShipmentResource_ManagementShippingInfoSearch
 *
 * Quirks:
 *   - Qoo10 API responses are mixed XML + Excel-like CSV exports.
 *   - Order status terminology varies between Qoo10 KR / JP / SG. Map per region.
 *   - SKUs are seller-specified strings; we use them directly as externalSku.
 *
 * Implementation notes for the next dev:
 *   - Use fast-xml-parser to handle the SOAP-style envelopes.
 *   - Qoo10 order list endpoint: ShipmentInfo_GetUnShippedList (pre-ship)
 *     and ShipmentInfo_GetShippingHistory (post-ship). Combine both.
 *   - Pagination: dateStart / dateEnd; 30-day max range per call.
 *
 * Why stub: requires QSM seller account + API approval; the SOAP-XML
 * surface is fragile and needs real fixtures to test against.
 */
export const qoo10Adapter: MarketplaceAdapter = {
  channel: "QOO10",
  displayName: "Qoo10",
  implemented: false,

  async verifyCredentials() {
    return { ok: false, message: "Qoo10 adapter not implemented yet" };
  },

  async listOrdersSince() {
    throw new Error("Qoo10 adapter not implemented yet");
  },
};
