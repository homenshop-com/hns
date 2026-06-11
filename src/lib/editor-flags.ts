/**
 * Editor feature flags.
 *
 * V2 editor (Tier-1 scene graph + LayerPanel) rolls out via a simple
 * email whitelist in `NEXT_PUBLIC_EDITOR_V2_USERS` (comma-separated).
 * Use "*" to enable for all users. Default is off.
 *
 * Using NEXT_PUBLIC_* so the check works in client components without
 * an RPC round-trip. The list is non-sensitive (just email addresses
 * of opt-in testers).
 */

function getWhitelist(): string[] {
  const raw = process.env.NEXT_PUBLIC_EDITOR_V2_USERS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEditorV2Enabled(email: string | null | undefined): boolean {
  const list = getWhitelist();
  // "*" means literally everyone — must win BEFORE the email guard. On
  // white-label reseller domains the OAuth proxy flow can yield a session
  // without an email; with "*" set, V2 must still be on for that session,
  // otherwise the per-device save path is silently bypassed and a
  // mobile-mode edit bakes its geometry into the desktop base html.
  if (list.includes("*")) return true;
  if (!email) return false;
  return list.includes(email.toLowerCase());
}
