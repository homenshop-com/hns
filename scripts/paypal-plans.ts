/**
 * One-time setup script: creates PayPal Product + Billing Plans in sandbox (or live).
 *
 * Usage:
 *   npx tsx scripts/paypal-plans.ts
 *
 * Required env vars (set in .env.local or shell):
 *   PAYPAL_ENV          "sandbox" | "live"  (default: sandbox)
 *   PAYPAL_CLIENT_ID    your PayPal app client ID
 *   PAYPAL_SECRET       your PayPal app secret
 *
 * After running, add the printed plan IDs to .env.local on the server:
 *   PAYPAL_PLAN_MONTHLY=P-xxxxxxxx
 *   PAYPAL_PLAN_YEARLY=P-xxxxxxxx
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

const BASE = process.env.PAYPAL_ENV === "live" ? LIVE_BASE : SANDBOX_BASE;
const ENV_LABEL = process.env.PAYPAL_ENV === "live" ? "🔴 LIVE" : "🟡 SANDBOX";

async function getToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_SECRET env vars first.");
  }

  const creds = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token fetch failed [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function post(token: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`[${res.status}] ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log(`\n🛒  Homenshop PayPal Plan Setup (${ENV_LABEL})\n`);

  const token = await getToken();
  console.log("✅  OAuth token obtained\n");

  // 1. Create Product (service, software category)
  console.log("→  Creating PayPal Product...");
  const product = await post(token, "/v1/catalogs/products", {
    name: "Homenshop Site Subscription",
    description: "Recurring website hosting subscription for Homenshop sites",
    type: "SERVICE",
    category: "SOFTWARE",
    home_url: "https://homenshop.com",
  });
  const productId = product.id as string;
  console.log(`   Product ID: ${productId}\n`);

  // 2. Create Monthly Plan ($4.99/month)
  console.log("→  Creating Monthly Plan ($4.99/month)...");
  const monthly = await post(token, "/v1/billing/plans", {
    product_id: productId,
    name: "Homenshop Monthly",
    description: "Homenshop site — $4.99/month auto-renewal",
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0, // 0 = infinite
        pricing_scheme: {
          fixed_price: { value: "4.99", currency_code: "USD" },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0", currency_code: "USD" },
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  });
  const monthlyPlanId = monthly.id as string;
  console.log(`   Monthly Plan ID: ${monthlyPlanId}\n`);

  // 3. Create Annual Plan ($49.99/year)
  console.log("→  Creating Annual Plan ($49.99/year)...");
  const annual = await post(token, "/v1/billing/plans", {
    product_id: productId,
    name: "Homenshop Annual",
    description: "Homenshop site — $49.99/year auto-renewal",
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "YEAR", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0, // 0 = infinite
        pricing_scheme: {
          fixed_price: { value: "49.99", currency_code: "USD" },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0", currency_code: "USD" },
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  });
  const annualPlanId = annual.id as string;
  console.log(`   Annual Plan ID: ${annualPlanId}\n`);

  // 4. Print env vars to add
  console.log("═".repeat(60));
  console.log("✅  Done! Add these to .env.local on the server:\n");
  console.log(`PAYPAL_PLAN_MONTHLY=${monthlyPlanId}`);
  console.log(`PAYPAL_PLAN_YEARLY=${annualPlanId}`);
  console.log("\n");
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message);
  process.exit(1);
});
