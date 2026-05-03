/**
 * Solapi SMS client.
 * Docs: https://developers.solapi.com/references/messages/sendSimpleMessages
 *
 * Required env vars (server-side only — never expose to the client):
 *   SOLAPI_API_KEY      — apiKey from console.solapi.com/credentials
 *   SOLAPI_API_SECRET   — apiSecret (used to sign each request)
 *   SOLAPI_SENDER       — registered sender phone, digits only e.g. "0212345678"
 *
 * If any env var is missing the client falls back to "test mode": the
 * message is logged to stderr and the call returns ok. This lets the
 * registration flow be exercised in dev without a live Solapi account.
 *
 * Auth scheme (HMAC-SHA256):
 *   signature = HMAC-SHA256(date + salt) keyed with apiSecret, hex digest
 *   Authorization: HMAC-SHA256 apiKey=K, date=D, salt=S, signature=SIG
 */
import crypto from "crypto";

const API_BASE = "https://api.solapi.com";

export interface SendSmsResult {
  ok: boolean;
  /** Solapi messageId on success, or null in test mode. */
  messageId: string | null;
  /** When ok=false, the upstream error message. */
  error?: string;
  /** True when no Solapi credentials were configured and we logged to stderr. */
  testMode?: boolean;
}

interface SolapiSendResponse {
  groupId?: string;
  to?: string;
  from?: string;
  type?: string;
  statusCode?: string;
  statusMessage?: string;
  messageId?: string;
  // Error responses come with errorCode + errorMessage at top level.
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Strip every non-digit character. Solapi expects digits only —
 * "+82 10-1234-5678" → "821012345678", "010-1234-5678" → "01012345678".
 */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Korean number heuristic for display only — turns "01012345678" into
 * "010-1234-5678". Storage / API calls always use digits-only.
 */
export function formatKoreanPhone(phone: string): string {
  const d = normalizePhoneDigits(phone);
  if (d.length === 11 && d.startsWith("010")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * Send a transactional SMS via Solapi.
 *
 * - Body ≤ 90 bytes (UTF-8) is sent as SMS; longer bodies are sent as
 *   LMS (long message, up to 2000 bytes). Solapi will auto-classify if
 *   `type` is omitted, but we set it explicitly so behaviour matches
 *   what we charge against in our own logs.
 *
 * Errors do not throw — they return { ok: false, error } so callers can
 * choose to surface a generic message to users without leaking provider
 * detail.
 */
export async function sendSms(
  to: string,
  body: string,
): Promise<SendSmsResult> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  const recipientNo = normalizePhoneDigits(to);
  if (!recipientNo || recipientNo.length < 9) {
    return { ok: false, messageId: null, error: "INVALID_PHONE" };
  }

  if (!apiKey || !apiSecret || !sender) {
    // Dev / test mode: emit to stderr so developers can read the OTP
    // off the server log without paying for SMS or registering a sender.
    console.warn(
      `[sms:test-mode] would send to ${recipientNo}: ${body.replace(/\n/g, " | ")}`,
    );
    return { ok: true, messageId: null, testMode: true };
  }

  // SMS limit is 90 bytes UTF-8. Korean chars are 3 bytes UTF-8, so a
  // typical Korean OTP body fits — but we switch to LMS the moment we
  // cross to keep delivery deterministic.
  const isLms = Buffer.byteLength(body, "utf8") > 90;

  const message: Record<string, unknown> = {
    to: recipientNo,
    from: normalizePhoneDigits(sender),
    text: body,
    type: isLms ? "LMS" : "SMS",
  };
  // LMS supports a subject; SMS does not. Solapi rejects subject on SMS.
  if (isLms) message.subject = "homeNshop";

  try {
    const res = await fetch(`${API_BASE}/messages/v4/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(apiKey, apiSecret),
      },
      body: JSON.stringify({ message }),
    });

    const data = (await res.json().catch(() => ({}))) as SolapiSendResponse;

    if (!res.ok) {
      const err =
        data.errorMessage ?? data.statusMessage ?? `HTTP_${res.status}`;
      console.error(
        `[sms] Solapi HTTP ${res.status} for ${recipientNo}: ${err}`,
      );
      return { ok: false, messageId: null, error: err };
    }

    // Solapi returns 200 even for some logical failures — verify the
    // statusCode. "2000" is success; anything else is a delivery issue.
    if (data.statusCode && data.statusCode !== "2000") {
      console.error(
        `[sms] Solapi status ${data.statusCode} for ${recipientNo}: ${data.statusMessage}`,
      );
      return {
        ok: false,
        messageId: null,
        error: data.statusMessage ?? data.statusCode,
      };
    }

    return {
      ok: true,
      messageId: data.messageId ?? data.groupId ?? null,
    };
  } catch (err) {
    console.error("[sms] Solapi request error:", err);
    return { ok: false, messageId: null, error: "NETWORK_ERROR" };
  }
}

/**
 * Build the OTP message body. Kept here (not at call site) so the wording
 * stays consistent across send/resend and so the byte count calculation
 * above sees the final string.
 */
export function buildOtpMessage(code: string): string {
  return `[homeNshop] 인증번호 ${code} (3분 이내 입력)`;
}
