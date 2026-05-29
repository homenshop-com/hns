#!/usr/bin/env node
/**
 * Smoke-test the GA Data API connection.
 *
 *   node scripts/test-ga.mjs
 *
 * Reads GA_PROPERTY_ID + GA_SERVICE_ACCOUNT_JSON from .env.local and runs a
 * single 7-day totalUsers report. Prints success or the raw API error.
 *
 * Use this right after granting the service account Viewer access in GA —
 * before bothering to spin up `npm run dev`.
 */
import { readFileSync } from "node:fs";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

// Minimal dotenv — only read the two vars we need.
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const propertyId = env.GA_PROPERTY_ID;
const credsJson = env.GA_SERVICE_ACCOUNT_JSON;

if (!propertyId || !credsJson) {
  console.error("❌ .env.local 에 GA_PROPERTY_ID / GA_SERVICE_ACCOUNT_JSON 가 없습니다.");
  process.exit(1);
}

const credentials = JSON.parse(credsJson);
console.log(`→ Property ID: ${propertyId}`);
console.log(`→ Service account: ${credentials.client_email}`);
console.log("→ Calling Data API…\n");

const client = new BetaAnalyticsDataClient({ credentials });

try {
  const [resp] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    metrics: [{ name: "totalUsers" }, { name: "screenPageViews" }],
  });
  const row = resp.rows?.[0]?.metricValues ?? [];
  console.log("✅ 성공!");
  console.log(`   totalUsers (7일): ${row[0]?.value ?? 0}`);
  console.log(`   pageViews (7일):  ${row[1]?.value ?? 0}`);
  console.log("\n→ /admin 대시보드에서도 동일한 데이터가 보일 겁니다.");
} catch (e) {
  console.error("❌ 실패:", e.message);
  if (e.message?.includes("PERMISSION_DENIED")) {
    console.error("   서비스 계정이 아직 GA Property 에 추가 안 됨.");
  } else if (e.message?.includes("404")) {
    console.error("   GA_PROPERTY_ID 가 잘못됨.");
  }
  process.exit(1);
}
