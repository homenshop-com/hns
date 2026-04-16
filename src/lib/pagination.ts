/**
 * Pagination helpers.
 *
 * The naive pattern `Math.max(1, parseInt(x || "1", 10))` silently produces
 * NaN when the input is non-numeric (e.g. "?page=abc"), because
 * `Math.max(1, NaN)` is NaN per the ECMAScript spec. Passing NaN into
 * Prisma's `skip`/`take` raises "Value can only be positive" at runtime.
 *
 * These helpers explicitly reject non-finite values and fall back to
 * sensible defaults.
 */

/**
 * Parse a 1-indexed page number from a query param.
 * Returns `defaultPage` if the input is missing, non-numeric, or < 1.
 */
export function parsePageParam(
  value: string | null | undefined,
  defaultPage = 1
): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPage;
}

/**
 * Parse a limit / page-size query param, clamped to [1, max].
 * Returns `defaultLimit` if the input is missing or non-numeric.
 */
export function parseLimitParam(
  value: string | null | undefined,
  defaultLimit = 10,
  max = 100
): number {
  const parsed = parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return Math.min(max, parsed);
}
