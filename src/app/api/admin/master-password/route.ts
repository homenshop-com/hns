import { NextResponse } from "next/server";

/**
 * GET /api/admin/master-password — DEPRECATED / DISABLED.
 *
 * This endpoint used to return the plaintext env master password to ADMIN
 * sessions so the login page could auto-fill the impersonation password.
 * That shipped a platform-wide impersonation credential to the browser (XSS
 * → full member takeover, value outlives the session).
 *
 * Impersonation now uses the scoped token flow (POST /api/admin/impersonate),
 * which swaps in a short-lived session for the target user and backs up the
 * admin/reseller session for restore — no plaintext ever leaves the server.
 *
 * Kept as a 410 (instead of deleting) so any stale client gets a clear
 * signal rather than a silent 404. The MASTER_PASSWORD env var is no longer
 * read here.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Deprecated. Use POST /api/admin/impersonate." },
    { status: 410 },
  );
}
