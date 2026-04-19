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
  if (!email) return false;
  const list = getWhitelist();
  if (list.includes("*")) return true;
  return list.includes(email.toLowerCase());
}
