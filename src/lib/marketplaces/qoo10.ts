import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  NormalizedOrder,
  SyncResult,
} from "./types";
import type { OrderStatus } from "@/generated/prisma/client";

/**
 * Qoo10 (QSM) QAPI adapter — full reference implementation.
 *
 * Auth flow:
 *   1. Seller registers an API key in QSM (통합관리 → API Setup).
 *   2. We POST to CertificationAPI_Certification.aspx with
 *      { key, user_id, pwd } to receive a short-lived "Cert Key".
 *   3. All subsequent endpoint calls use the Cert Key in the
 *      `giosis-certification-key` header (and in body params).
 *
 * Cert Keys live ~6 hours per Qoo10 docs. We cache per-process by
 * (region, apiKey, userId) and fall back to re-auth on 401-style
 * responses. Cron polls run as a single Node process so memory cache
 * is fine; no Redis needed.
 *
 * Order endpoints used:
 *   - ShipmentInfo_GetUnShippedList: orders paid but not yet shipped.
 *     Drives the "new orders" feed for sellers.
 *   - ShipmentInfo_GetShippingHistory: orders that have shipped.
 *     Provides tracking + delivery status updates.
 *
 * Region: Qoo10 runs three storefronts (JP / KR / SG) on independent
 * domains and seller account spaces. Each integration row stores its
 * region; we pick the matching base URL.
 *
 * Status mapping (Qoo10 → homenshop):
 *   New / Pre-paid / Awaiting payment      → PENDING
 *   Paid / Awaiting shipment               → PAID
 *   Shipping / In-transit                  → SHIPPING
 *   Delivered / Confirmed                  → DELIVERED
 *   Cancelled / Buyer cancelled            → CANCELLED
 *   Refund completed / Returned            → REFUNDED
 *
 * Tested against: Qoo10 JP and KR. SG follows same shape; test before
 * production use.
 *
 * Reference docs: https://api.qoo10.jp/GMKT.INC.Front.QApiService/Document/QAPIGuideIndex.aspx
 */

interface Qoo10Creds extends MarketplaceCredentials {
  apiKey: string;
  userId: string;
  password: string;
  /// "JP" | "KR" | "SG" — defaults to JP when missing.
  region?: string;
  /// Seller ID (optional — mostly informational).
  sellerId?: string;
}

function isQoo10Creds(c: MarketplaceCredentials): c is Qoo10Creds {
  return (
    typeof c.apiKey === "string" &&
    typeof c.userId === "string" &&
    typeof c.password === "string"
  );
}

function baseUrl(region: string | undefined): string {
  switch ((region || "JP").toUpperCase()) {
    case "KR":
      return "https://api.qoo10.kr/GMKT.INC.Front.QApiService";
    case "SG":
      return "https://api.qoo10.sg/GMKT.INC.Front.QApiService";
    case "JP":
    default:
      return "https://api.qoo10.jp/GMKT.INC.Front.QApiService";
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Cert Key cache
 *
 * Per-process map keyed by (region|apiKey|userId). Cert keys live
 * ~6 hours; we expire ours at 5h to leave a safety margin.
 * ────────────────────────────────────────────────────────────────── */

interface CachedCert {
  certKey: string;
  expiresAt: number; // epoch ms
}
const certCache = new Map<string, CachedCert>();
const CERT_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

function cacheKey(creds: Qoo10Creds): string {
  return `${creds.region ?? "JP"}|${creds.apiKey}|${creds.userId}`;
}

/// Read the Qoo10 response as text first so we can surface useful error
/// messages when the server returns empty/HTML/XML instead of JSON.
async function readQoo10Response<T = unknown>(
  res: Response,
  endpoint: string,
): Promise<T> {
  const text = await res.text();
  if (!text || text.length === 0) {
    throw new Error(
      `Qoo10 ${endpoint} returned empty response (HTTP ${res.status}). API key may not be activated yet, or the user_id/password is wrong.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Qoo10 ${endpoint} HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  // Sometimes QAPI wraps the JSON in a leading BOM or whitespace; trim
  // before parsing.
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error(
      `Qoo10 ${endpoint} returned non-JSON (HTTP ${res.status}): ${trimmed.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new Error(
      `Qoo10 ${endpoint} JSON parse failed: ${(err as Error).message} — body=${trimmed.slice(0, 200)}`,
    );
  }
}

async function getCertKey(creds: Qoo10Creds, force = false): Promise<string> {
  const key = cacheKey(creds);
  const now = Date.now();
  if (!force) {
    const hit = certCache.get(key);
    if (hit && hit.expiresAt > now) return hit.certKey;
  }

  // Qoo10 QAPI: try the documented ".aspx" form first, then fall back
  // to the dot-style name some QSM regions use. This is needed because
  // Qoo10's URL convention is inconsistent across regions and historical
  // doc revisions, and the wrong form returns HTTP 200 with an empty
  // body (not 404), which is impossible to diagnose without trying both.
  const candidates = [
    `${baseUrl(creds.region)}/ebayjapan.qapi/CertificationAPI_Certification.aspx`,
    `${baseUrl(creds.region)}/ebayjapan.qapi/CertificationAPI.Certification.aspx`,
    `${baseUrl(creds.region)}/ebayjapan.qapi/CertificationAPI.Certification`,
  ];
  const body = new URLSearchParams({
    key: creds.apiKey,
    user_id: creds.userId,
    pwd: creds.password,
  });
  let json: { ResultCode?: number; ResultMsg?: string; ResultObject?: string } | null = null;
  let lastErr: Error | null = null;
  for (const url of candidates) {
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 15000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: body.toString(),
          signal: ctl.signal,
        });
      } finally {
        clearTimeout(tm);
      }
      json = await readQoo10Response<{
        ResultCode?: number;
        ResultMsg?: string;
        ResultObject?: string;
      }>(res, "Certification");
      break;
    } catch (err) {
      lastErr = err as Error;
      continue;
    }
  }
  if (!json) {
    throw lastErr ?? new Error("Qoo10 auth failed (no response from any URL variant)");
  }
  if (json.ResultCode !== 0 || !json.ResultObject) {
    throw new Error(
      `Qoo10 auth failed (code=${json.ResultCode}): ${json.ResultMsg ?? "unknown"}`,
    );
  }
  certCache.set(key, {
    certKey: json.ResultObject,
    expiresAt: now + CERT_TTL_MS,
  });
  return json.ResultObject;
}

/* ──────────────────────────────────────────────────────────────────
 * Generic API caller — handles auth retry on cert expiry.
 * ────────────────────────────────────────────────────────────────── */

async function callQapi(
  creds: Qoo10Creds,
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const certKey = await getCertKey(creds, attempt > 0);
    const url = `${baseUrl(creds.region)}/ebayjapan.qapi/${endpoint}`;
    const body = new URLSearchParams({ key: certKey, ...params });
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "giosis-certification-key": certKey,
        },
        body: body.toString(),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(tm);
    }
    const json = await readQoo10Response<{ ResultCode?: number; ResultMsg?: string }>(
      res,
      endpoint,
    );
    // ResultCode -10001 / -10002 typically signal expired cert; retry once
    // with a fresh auth before bubbling the error up to the caller.
    if (
      attempt === 0 &&
      typeof json.ResultCode === "number" &&
      [-10001, -10002, -10003].includes(json.ResultCode)
    ) {
      certCache.delete(cacheKey(creds));
      continue;
    }
    if (json.ResultCode !== 0) {
      throw new Error(
        `Qoo10 ${endpoint} failed (code=${json.ResultCode}): ${json.ResultMsg ?? "unknown"}`,
      );
    }
    return json;
  }
  throw new Error("Qoo10 auth retry exhausted");
}

/* ──────────────────────────────────────────────────────────────────
 * Order shape (from Qoo10 responses) and normalization.
 * Field names match Qoo10's QAPI documented response keys.
 * ────────────────────────────────────────────────────────────────── */

interface Qoo10OrderRaw {
  OrderNo?: string;
  PackNo?: string;
  ShippingNo?: string;
  OrderDate?: string;
  PaymentDate?: string;
  ShippingDate?: string;
  ItemCode?: string;
  OptionCode?: string;
  ItemName?: string;
  Qty?: number | string;
  Quantity?: number | string;
  Price?: number | string;
  SellPrice?: number | string;
  ItemPrice?: number | string;
  ShippingPrice?: number | string;
  ShippingFee?: number | string;
  TotalPrice?: number | string;
  /// Buyer fields
  BuyerName?: string;
  BuyerEmail?: string;
  BuyerTel?: string;
  BuyerMobile?: string;
  BuyerLoginId?: string;
  /// Receiver / shipping address
  ReceiverName?: string;
  ReceiverTel?: string;
  ReceiverMobile?: string;
  ZipCode?: string;
  Address1?: string;
  Address2?: string;
  Country?: string;
  /// Notes / memo
  ShippingMsg?: string;
  Memo?: string;
  /// Status code
  Status?: string;
  OrderStatus?: string;
}

function num(x: number | string | undefined, fallback = 0): number {
  if (typeof x === "number") return x;
  if (!x) return fallback;
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : fallback;
}

function mapStatus(raw: string | undefined): OrderStatus {
  // Qoo10 uses single-letter status families in QSM (N/P/S/D/C/R/X)
  // plus numeric subcodes. We collapse to the homenshop bucket.
  const s = (raw ?? "").trim().toUpperCase();
  if (s.startsWith("N") || s === "READY") return "PENDING";
  if (s.startsWith("S") || s === "SHIPPING" || s === "INTRANSIT")
    return "SHIPPING";
  if (s.startsWith("D") || s === "DELIVERED") return "DELIVERED";
  if (s.startsWith("C") || s === "CANCELLED" || s === "CANCELED")
    return "CANCELLED";
  if (s.startsWith("R") || s === "RETURNED" || s === "REFUNDED")
    return "REFUNDED";
  return "PAID";
}

function joinAddress(o: Qoo10OrderRaw): string | undefined {
  const parts = [o.Country, o.ZipCode, o.Address1, o.Address2].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function normalize(raw: Qoo10OrderRaw, defaultStatus: OrderStatus): NormalizedOrder {
  const orderId = raw.OrderNo || raw.PackNo || raw.ShippingNo || "unknown";
  const qty = num(raw.Qty ?? raw.Quantity, 1);
  const unitPrice = num(raw.SellPrice ?? raw.Price ?? raw.ItemPrice, 0);
  const shippingFee = num(raw.ShippingPrice ?? raw.ShippingFee, 0);
  const total = num(raw.TotalPrice, unitPrice * qty + shippingFee);
  const sku = [raw.ItemCode, raw.OptionCode].filter(Boolean).join("|") || orderId;

  // Use raw status if present, else fall back to the bucket the calling
  // endpoint implies (e.g. GetUnShippedList → PAID, GetShippingHistory → SHIPPING).
  const status = raw.Status || raw.OrderStatus
    ? mapStatus(raw.Status || raw.OrderStatus)
    : defaultStatus;

  const placedAt = raw.PaymentDate
    ? new Date(raw.PaymentDate)
    : raw.OrderDate
      ? new Date(raw.OrderDate)
      : new Date();

  const buyerPhone = raw.BuyerMobile || raw.BuyerTel;
  const recvPhone = raw.ReceiverMobile || raw.ReceiverTel;

  return {
    externalOrderId: String(orderId),
    status,
    totalAmount: Math.round(total),
    shippingName: raw.ReceiverName ?? raw.BuyerName ?? undefined,
    shippingPhone: recvPhone ?? buyerPhone ?? undefined,
    shippingAddr: joinAddress(raw),
    shippingMemo: raw.ShippingMsg ?? raw.Memo ?? undefined,
    customer: raw.BuyerLoginId || raw.BuyerEmail || raw.BuyerName
      ? {
          externalId: raw.BuyerLoginId || undefined,
          email: raw.BuyerEmail || undefined,
          phone: buyerPhone || undefined,
          name: raw.BuyerName || undefined,
        }
      : undefined,
    items: [
      {
        externalSku: sku,
        externalName: raw.ItemName || sku,
        quantity: qty,
        price: Math.round(unitPrice),
      },
    ],
    placedAt,
    raw,
  };
}

function fmtDate(d: Date): string {
  // Qoo10 expects local-style "YYYY-MM-DD" for date filters.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ──────────────────────────────────────────────────────────────────
 * Public adapter
 * ────────────────────────────────────────────────────────────────── */

export const qoo10Adapter: MarketplaceAdapter = {
  channel: "QOO10",
  displayName: "Qoo10",
  implemented: true,

  async verifyCredentials(creds: MarketplaceCredentials) {
    if (!isQoo10Creds(creds)) {
      return { ok: false, message: "apiKey, userId, password required" };
    }
    try {
      await getCertKey(creds, true);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  async listOrdersSince(
    creds: MarketplaceCredentials,
    sinceMs: number,
  ): Promise<SyncResult> {
    if (!isQoo10Creds(creds)) {
      throw new Error("Invalid Qoo10 credentials");
    }
    // Qoo10 requires a date window (max ~30 days). We cap the lookback
    // at 30 days to stay safe; the cron's 1-hour overlap means anything
    // older has already been imported on previous runs.
    const sinceCapped = Math.max(sinceMs, Date.now() - 30 * 24 * 60 * 60 * 1000);
    const start = fmtDate(new Date(sinceCapped));
    const end = fmtDate(new Date());

    const collected: NormalizedOrder[] = [];
    let cursor = sinceMs;

    // 1) Unshipped (paid, awaiting shipment)
    try {
      const unshipped = (await callQapi(creds, "ShipmentInfo_GetUnShippedList.aspx", {
        search_Sdate: start,
        search_Edate: end,
      })) as { ResultObject?: Qoo10OrderRaw[] };
      for (const raw of unshipped.ResultObject ?? []) {
        const norm = normalize(raw, "PAID");
        collected.push(norm);
        cursor = Math.max(cursor, norm.placedAt.getTime());
      }
    } catch (err) {
      console.warn("[qoo10] GetUnShippedList failed:", err);
    }

    // 2) Shipped/delivered history
    try {
      const shipped = (await callQapi(creds, "ShipmentInfo_GetShippingHistory.aspx", {
        ship_Sdate: start,
        ship_Edate: end,
      })) as { ResultObject?: Qoo10OrderRaw[] };
      for (const raw of shipped.ResultObject ?? []) {
        const norm = normalize(raw, "SHIPPING");
        collected.push(norm);
        cursor = Math.max(cursor, norm.placedAt.getTime());
      }
    } catch (err) {
      console.warn("[qoo10] GetShippingHistory failed:", err);
    }

    return { orders: collected, cursor };
  },
};

/* ──────────────────────────────────────────────────────────────────
 * Reverse push — send tracking info back to Qoo10.
 *
 * Used when the seller updates an order's shipping in homenshop and we
 * want to mirror to Qoo10 ("배송 정보 등록"). Not wired to the cron
 * pipeline yet (orders flow IN by default); call this from a future
 * /api/orders/[id]/ship endpoint when the seller takes action.
 * ────────────────────────────────────────────────────────────────── */

export async function qoo10SendTracking(
  creds: MarketplaceCredentials,
  args: {
    orderNo: string;
    shippingCompany: string; // Qoo10 shipping company code (e.g. "JPYP" for Japan Post)
    trackingNo: string;
  },
): Promise<void> {
  if (!isQoo10Creds(creds)) throw new Error("Invalid Qoo10 credentials");
  await callQapi(creds, "ShipmentInfo_SendDeliveryInformation.aspx", {
    OrderNo: args.orderNo,
    ShippingCompany: args.shippingCompany,
    TrackingNo: args.trackingNo,
  });
}
