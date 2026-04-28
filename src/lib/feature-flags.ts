/**
 * Feature flags / access-control helpers.
 *
 * Centralized so that gates applied in UI (sidebar visibility), pages
 * (server-side redirects), and APIs (403 responses) all reference the
 * same source of truth. Adding/removing an email here updates every
 * gate at once.
 */

/**
 * Marketplace integrations are a beta-staged feature. Only the listed
 * emails see the sidebar item, the /dashboard/sites marketplace summary
 * panel, and can hit the underlying APIs. All other accounts get a
 * silent 404-equivalent (sidebar hidden + redirect to /dashboard).
 *
 * Add new emails here; no other file change needed.
 */
const INTEGRATIONS_ALLOWLIST = new Set([
  "archipfe@gmail.com",
  "master@homenshop.com",
]);

export function canAccessIntegrations(email: string | null | undefined): boolean {
  if (!email) return false;
  return INTEGRATIONS_ALLOWLIST.has(email.toLowerCase());
}
