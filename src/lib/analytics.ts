/**
 * Google Analytics 4 Data API wrapper.
 *
 * The admin dashboard consumes this — service-account credentials never leave
 * the server. Public site tracking is separate (gtag.js injected in
 * `src/app/layout.tsx`); this file only talks to the Data API for reporting.
 *
 * Config:
 *   GA_PROPERTY_ID            — numeric GA4 property ID (Admin → Property details)
 *   GA_SERVICE_ACCOUNT_JSON   — full JSON of the service account key, one line
 *
 * If either is missing we return a `configured: false` payload instead of
 * throwing — that lets the dashboard render a "not connected" card rather
 * than a 500 page during initial setup.
 */
import { BetaAnalyticsDataClient } from "@google-analytics/data";

export type AnalyticsSummary =
  | {
      configured: true;
      propertyId: string;
      // Last 7 days
      totalUsers: number;
      newUsers: number;
      sessions: number;
      pageViews: number;
      // Realtime
      activeUsersNow: number;
      // Top 10 pages, last 7 days, ranked by views
      topPages: Array<{ path: string; title: string; views: number }>;
      // Daily series for sparkline (last 7 days, oldest → newest)
      daily: Array<{ date: string; users: number; pageViews: number }>;
    }
  | { configured: false; reason: string };

let client: BetaAnalyticsDataClient | null = null;
let clientError: string | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  if (client) return client;
  if (clientError) return null;

  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    clientError = "GA_SERVICE_ACCOUNT_JSON not set";
    return null;
  }
  try {
    const credentials = JSON.parse(raw);
    client = new BetaAnalyticsDataClient({ credentials });
    return client;
  } catch (e) {
    clientError = `GA_SERVICE_ACCOUNT_JSON parse error: ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Service account email — safe to expose publicly. Users need it visible in the
 * dashboard so they can paste it into their GA "Property access management" to
 * grant our reader Viewer access. Read from the credential JSON at boot.
 */
export function getServiceAccountEmail(): string | null {
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw).client_email ?? null;
  } catch {
    return null;
  }
}

/**
 * One round-trip (well, four parallel ones) to populate the entire GA panel
 * for a single property. Wrapped in try/catch so a Data API failure renders
 * an empty "configured" state instead of crashing the dashboard.
 *
 * Pass `propertyId` to read a specific GA4 property — used by user-facing
 * dashboards to surface each member's own site analytics. Falls back to
 * `GA_PROPERTY_ID` env when omitted, which is what the admin homenshop.com
 * panel uses.
 */
export async function getAnalyticsSummary(
  propertyIdOverride?: string | null,
): Promise<AnalyticsSummary> {
  const propertyId = propertyIdOverride ?? process.env.GA_PROPERTY_ID;
  if (!propertyId) {
    return { configured: false, reason: "GA_PROPERTY_ID 미설정" };
  }

  const c = getClient();
  if (!c) {
    return { configured: false, reason: clientError ?? "GA 클라이언트 초기화 실패" };
  }

  const property = `properties/${propertyId}`;

  try {
    const [totalsRes, topPagesRes, dailyRes, realtimeRes] = await Promise.all([
      // Aggregated 7-day metrics
      c.runReport({
        property,
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
      }),
      // Top pages by views, 7 days
      c.runReport({
        property,
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      // Daily series for sparkline
      c.runReport({
        property,
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "totalUsers" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      // Realtime active users (last 30 min)
      c.runRealtimeReport({
        property,
        metrics: [{ name: "activeUsers" }],
      }),
    ]);

    const totalsRow = totalsRes[0].rows?.[0]?.metricValues ?? [];
    const realtimeRow = realtimeRes[0].rows?.[0]?.metricValues ?? [];

    return {
      configured: true,
      propertyId,
      totalUsers: num(totalsRow[0]?.value),
      newUsers: num(totalsRow[1]?.value),
      sessions: num(totalsRow[2]?.value),
      pageViews: num(totalsRow[3]?.value),
      activeUsersNow: num(realtimeRow[0]?.value),
      topPages: (topPagesRes[0].rows ?? []).map((r) => ({
        path: r.dimensionValues?.[0]?.value ?? "",
        title: r.dimensionValues?.[1]?.value ?? "",
        views: num(r.metricValues?.[0]?.value),
      })),
      daily: (dailyRes[0].rows ?? []).map((r) => ({
        date: r.dimensionValues?.[0]?.value ?? "",
        users: num(r.metricValues?.[0]?.value),
        pageViews: num(r.metricValues?.[1]?.value),
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Most common: PERMISSION_DENIED when the service account isn't added to
    // the GA4 property. Surface the raw API message — the admin needs it to
    // diagnose, and this endpoint is admin-only.
    return { configured: false, reason: `GA Data API 호출 실패: ${msg}` };
  }
}
