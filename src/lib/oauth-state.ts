/**
 * Signed OAuth `state` helper — prevents CSRF/forgery of third-party OAuth
 * callbacks (e.g. Shopify). The install step signs the state value with an
 * HMAC keyed by AUTH_SECRET; the callback verifies the signature before
 * trusting any id embedded in it. Without this, an attacker could craft a
 * callback carrying a VICTIM's integrationId and have their own shop's token
 * written into the victim's integration row.
 */
import { createHmac, timingSafeEqual } from "crypto";

function key(): string {
  return process.env.AUTH_SECRET || "";
}

/** Append an HMAC signature: `"<value>.<sig>"`. */
export function signState(value: string): string {
  const sig = createHmac("sha256", key()).update(value).digest("base64url");
  return `${value}.${sig}`;
}

/** Verify a signed state; returns the original value or null if tampered. */
export function verifyState(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = createHmac("sha256", key()).update(value).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return value;
}
