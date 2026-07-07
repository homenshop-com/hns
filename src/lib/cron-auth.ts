import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Authenticate a cron request via `Authorization: Bearer $CRON_SECRET`.
 *
 * Fails CLOSED: if CRON_SECRET is unset every call is rejected. There is no
 * localhost / X-Forwarded-For bypass — the previous inference trusted the
 * first XFF segment (client-controlled) and treated an empty IP as localhost,
 * both of which let unauthenticated callers trigger credit grants / site
 * expiry. The server crontab must send `Authorization: Bearer $CRON_SECRET`.
 *
 * Returns null when authorized, or a 401 NextResponse when not.
 */
export function assertCron(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 401 });
  }
  const headerAuth = request.headers.get("authorization") || "";
  const token = headerAuth.replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
