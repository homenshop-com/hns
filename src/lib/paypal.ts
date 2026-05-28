/**
 * PayPal REST API client — Subscriptions API (v1/billing).
 *
 * Supports sandbox vs live via PAYPAL_ENV environment variable.
 * All functions throw on non-2xx HTTP responses (structured PayPalError).
 *
 * Required env vars:
 *   PAYPAL_ENV              "sandbox" | "live"  (default: "sandbox")
 *   PAYPAL_CLIENT_ID        OAuth2 client id
 *   PAYPAL_SECRET           OAuth2 client secret
 *   PAYPAL_WEBHOOK_ID       Webhook ID from PayPal developer dashboard
 */

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

function baseUrl(): string {
  return process.env.PAYPAL_ENV === "live" ? LIVE_BASE : SANDBOX_BASE;
}

// ─── Structured error ────────────────────────────────────────────────────────

export class PayPalError extends Error {
  constructor(
    public readonly status: number,
    public readonly name: string,
    public readonly message: string,
    public readonly details?: unknown,
  ) {
    super(`[PayPal ${status}] ${name}: ${message}`);
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // ignore parse error — body may be empty
  }
  throw new PayPalError(
    res.status,
    (body.name as string) ?? "UNKNOWN_ERROR",
    (body.message as string) ?? res.statusText,
    body.details,
  );
}

// ─── OAuth2 access token (in-process cache) ──────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let _tokenCache: TokenCache | null = null;

/**
 * Returns a valid OAuth2 access token, fetching a new one if expired.
 * Token is cached in-process for ~4.5 minutes (expire 30s before PayPal's 5min).
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_SECRET env vars are required");
  }

  const credentials = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  await throwIfNotOk(res);
  const data = (await res.json()) as { access_token: string; expires_in: number };

  _tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return _tokenCache.token;
}

// ─── Subscription API ─────────────────────────────────────────────────────────

export interface CreateSubscriptionResult {
  /** PayPal subscription resource ID (e.g. "I-BW452GLLEP1G"). */
  id: string;
  /** Redirect the user here to approve the subscription. */
  approveUrl: string;
}

/**
 * Creates a PayPal subscription for the given billing plan.
 * Returns the subscription ID and the approval URL to redirect the user to.
 */
export async function createSubscription(
  planId: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<CreateSubscriptionResult> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: planId,
      application_context: {
        brand_name: "Homenshop",
        locale: "ko-KR",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  await throwIfNotOk(res);
  const data = (await res.json()) as {
    id: string;
    links: Array<{ href: string; rel: string }>;
  };

  const approveLink = data.links.find((l) => l.rel === "approve");
  if (!approveLink) {
    throw new PayPalError(500, "MISSING_APPROVE_LINK", "PayPal response missing approve link");
  }

  return { id: data.id, approveUrl: approveLink.href };
}

/**
 * Fetches the current state of a PayPal subscription.
 * Returns the raw PayPal subscription resource.
 */
export async function getSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await throwIfNotOk(res);
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Cancels a PayPal subscription immediately.
 * Note: the user's access should be kept until currentPeriodEnd — the caller
 * should set cancelAtPeriodEnd=true in the DB rather than removing access here.
 */
export async function cancelSubscription(
  subscriptionId: string,
  reason = "User requested cancellation",
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  // 204 No Content = success; anything else is an error
  if (res.status === 204) return;
  await throwIfNotOk(res);
}

// ─── Webhook verification ─────────────────────────────────────────────────────

/**
 * Verifies a PayPal webhook signature using PayPal's own verification endpoint.
 * Throws if the signature is invalid or the verification call itself fails.
 *
 * @param headers  The request headers (must include PayPal-Transmission-* headers)
 * @param rawBody  The raw request body as received (MUST NOT be parsed/re-serialised)
 */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<void> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PAYPAL_WEBHOOK_ID env var is required for webhook verification");
  }

  const token = await getAccessToken();

  // PayPal requires these 4 headers for asymmetric signature verification.
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const authAlgo = headers.get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig || !authAlgo) {
    throw new PayPalError(400, "MISSING_WEBHOOK_HEADERS", "Missing required PayPal webhook headers");
  }

  const res = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });

  await throwIfNotOk(res);
  const data = (await res.json()) as { verification_status: string };

  if (data.verification_status !== "SUCCESS") {
    throw new PayPalError(
      401,
      "WEBHOOK_SIGNATURE_INVALID",
      `PayPal webhook signature verification failed: ${data.verification_status}`,
    );
  }
}
