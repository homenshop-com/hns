/**
 * Fine-grained permission helpers that sit ON TOP of the User.role field.
 *
 * Scope: some sensitive actions — e.g. editing the golden-copy of a
 * system template that every new site is minted from — should be locked
 * down to a named list of operators, not every `role === "ADMIN"` user.
 * Role is coarse (MEMBER / ADMIN); this file adds a narrower second tier.
 *
 * Why an email allowlist instead of a DB column:
 *  - We're only gating a handful of operators right now; a full RBAC
 *    table would be over-engineered.
 *  - Emails are already the unique identity in NextAuth, so no schema
 *    change, no migration, no UI to manage them.
 *  - Changing the list requires a code review, which is exactly the
 *    friction we want for a "who can touch golden templates" decision.
 *
 * To grant a new operator, add their email to TEMPLATE_EDITORS below
 * and deploy. To revoke, remove and deploy.
 */

/** Emails allowed to edit system templates (Template rows with userId=null).
 *  User-owned templates always remain editable by their owner regardless
 *  of this list — this only gates the system/golden copy. */
const TEMPLATE_EDITORS = new Set<string>([
  "master@homenshop.com",    // 총관리자
  "design@homenshop.com",    // 디자인 담당 최고 책임자
]);

function normalize(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

/**
 * Can this email edit system templates (list, basic info, design, sync)?
 * Used as:
 *   - guard on /api/admin/templates/* routes
 *   - sidebar filter in admin/layout.tsx
 *   - auto-sync gate in Site/Page PUT handlers (only for userId=null
 *     templates; user-owned templates use ownership instead)
 */
export function canEditTemplates(email: string | null | undefined): boolean {
  const e = normalize(email);
  if (!e) return false;
  return TEMPLATE_EDITORS.has(e);
}

/** Hook for UI: show a compact label of who's allowed, for tooltips. */
export function templateEditorsList(): string[] {
  return Array.from(TEMPLATE_EDITORS);
}
