/**
 * Domain input normalization helpers.
 *
 * Users paste things like "https://www.glopick.com/" — strip the cruft so the
 * value we verify against DNS and store as Reseller.domain is a bare host.
 */

/**
 * Light normalize, safe to run on every keystroke: removes protocol, any
 * path/query, and whitespace, then lowercases. Keeps a leading "www." so the
 * user can still type it without the characters vanishing mid-entry.
 */
export function normalizeDomainInput(v: string): string {
  return v
    .replace(/\s+/g, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/**
 * Full normalize for verification/submit: same as the input pass but also
 * strips a leading "www." so we always resolve/store the apex host.
 */
export function normalizeDomain(v: string): string {
  return normalizeDomainInput(v).replace(/^www\./, "");
}
