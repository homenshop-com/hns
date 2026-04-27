import type { MarketplaceAdapter } from "./types";

/**
 * Rakuten Ichiba (楽天市場) RMS WebService adapter — STUB.
 *
 * Auth: License Key + Secret Service (esa) Key issued by RMS.
 *   Seller logs into RMS → R-Login → API管理 → ライセンスキー発行.
 *
 * Required credentials shape (when implemented):
 *   { serviceSecret, licenseKey, shopId, shopUrl }
 *
 * Order endpoint:
 *   POST https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/
 *   Body: SOAP-style XML with searchKeyword, dateType, startDate, endDate.
 *   Auth header: Authorization: ESA Base64(serviceSecret:licenseKey)
 *
 * Quirks:
 *   - All responses in Japanese (orderProgress = 100/200/300 ladder).
 *   - Returns max 1,000 orders per call; paginate with PaginationRequestModel.
 *   - SKU = itemNumberForBuyer (seller-defined).
 *
 * Status mapping:
 *   100 (注文確認待ち) → PENDING
 *   200 (楽天処理中)   → PENDING
 *   300 (発送待ち)     → PAID
 *   400 (変更確定待ち) → PAID
 *   500 (発送済)       → SHIPPING
 *   600 (支払手続き中) → PAID
 *   700 (支払手続き済) → DELIVERED
 *   800 (キャンセル確定) → CANCELLED
 *   900 (キャンセル) → CANCELLED
 *
 * Implementation notes for the next dev:
 *   - SOAP body templates; use fast-xml-parser builder mode.
 *   - Date filter: dateType=1 (注文日), startDate/endDate in YYYY-MM-DD.
 *   - Rakuten Japan only — Rakuten Korea uses a different API surface.
 *
 * Why stub: needs a Rakuten Japan seller account + RMS API approval.
 */
export const rakutenAdapter: MarketplaceAdapter = {
  channel: "RAKUTEN",
  displayName: "Rakuten Ichiba",
  implemented: false,

  async verifyCredentials() {
    return { ok: false, message: "Rakuten RMS adapter not implemented yet" };
  },

  async listOrdersSince() {
    throw new Error("Rakuten RMS adapter not implemented yet");
  },
};
