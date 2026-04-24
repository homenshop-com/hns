/**
 * Site expiration helpers.
 *
 * accountType codes used across the app (string to match DB storage):
 *   "0" — free (체험 계정). Gets a 30-day trial on first creation.
 *   "1" — paid. expiresAt is set to the plan end date; cron tolerates renewal.
 *   "2" — test/internal. No expiration enforcement.
 *   "9" — expired (manually flagged or auto-downgraded).
 *
 * Phase 1 policy:
 *   · New sites default to accountType="0" with expiresAt = now + FREE_TRIAL_DAYS.
 *   · Once past expiresAt, the expire-sites cron flips published=false so the
 *     public site stops serving. accountType is left at "0" so the owner can
 *     still see it in dashboard and pay to extend — we don't mutate it to
 *     "9" automatically (that status is reserved for hard-disable by admin).
 *   · Published route returns an "expired" landing for isExpired() sites.
 */

export const FREE_TRIAL_DAYS = 30;
export const EXPIRATION_WARNING_DAYS = 7;

export type SiteExpirationView = {
  accountType: string;
  expiresAt: Date | null;
};

export function trialExpiryFromNow(days = FREE_TRIAL_DAYS): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Prisma.create defaults for brand-new free user sites. */
export function freeSiteDefaults(): { accountType: string; expiresAt: Date } {
  return { accountType: "0", expiresAt: trialExpiryFromNow() };
}

/** true when the site has passed its expiration and should be treated as inactive. */
export function isSiteExpired(site: SiteExpirationView): boolean {
  if (site.accountType === "9") return true;
  if (site.accountType === "2") return false; // test sites never expire
  if (!site.expiresAt) return false;
  return new Date(site.expiresAt).getTime() < Date.now();
}

/** Days remaining until expiration. Negative if already past. null if no expiration. */
export function daysUntilExpiry(site: SiteExpirationView): number | null {
  if (!site.expiresAt) return null;
  const ms = new Date(site.expiresAt).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Resolve the effective expiration date for display.
 *
 * Some legacy sites were created with `accountType="free"` and no
 * `expiresAt` (the current create paths use `freeSiteDefaults()` which
 * sets both correctly — but older imports skipped it). For UI purposes
 * we fall back to `createdAt + FREE_TRIAL_DAYS` so the user sees a
 * concrete date rather than "무제한" on their free trial.
 *
 * Returns null only for accountTypes that genuinely never expire
 * (test sites "2", paid-lifetime, etc.) AND have no stored expiresAt.
 */
export function resolveExpiresAt(site: {
  accountType: string;
  expiresAt: Date | null;
  createdAt: Date;
}): Date | null {
  if (site.expiresAt) return new Date(site.expiresAt);
  const t = String(site.accountType || "").toLowerCase();
  const isFree = t === "0" || t === "free";
  if (isFree) {
    const d = new Date(site.createdAt);
    d.setUTCDate(d.getUTCDate() + FREE_TRIAL_DAYS);
    return d;
  }
  return null;
}

/** true if the site should surface a "your free trial is ending" banner. */
export function shouldShowExpirationWarning(site: SiteExpirationView): boolean {
  if (site.accountType !== "0") return false;
  const d = daysUntilExpiry(site);
  return d !== null && d >= 0 && d <= EXPIRATION_WARNING_DAYS;
}
