/**
 * Subscription (구독 / 호스팅 연장) helpers.
 *
 * Phase 2 policy (PG 계약 전 — 무통장 입금 기반):
 *   1. User clicks "시작하기" on a plan → POST /api/sites/[siteId]/extend
 *      creates Order(orderType=SUBSCRIPTION, status=PENDING,
 *      subscriptionMonths=N, subscriptionSiteId, paymentMethod="BANK_TRANSFER").
 *   2. User is shown a deposit guide (은행/계좌/예금주 + 주문번호).
 *   3. Admin verifies deposit in /admin/orders → transitions to PAID.
 *   4. Transition hook (applyPaidSubscription) extends Site.expiresAt by
 *      subscriptionMonths and flips accountType to "1" (paid).
 */

export const MONTHLY_PRICE = 5500;

export type SubscriptionPlan = { months: 12 | 24 | 36; discount: number; label: string };

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { months: 12, discount: 0, label: "1년" },
  { months: 24, discount: 0.1, label: "2년" },
  { months: 36, discount: 0.2, label: "3년" },
];

export function priceForMonths(months: number): number {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.months === months);
  if (!plan) return 0;
  const base = MONTHLY_PRICE * plan.months;
  return base - Math.floor(base * plan.discount);
}

export function isValidSubscriptionMonths(n: unknown): n is 12 | 24 | 36 {
  return n === 12 || n === 24 || n === 36;
}

/**
 * Compute the new expiresAt after extending by N months.
 * Starts from max(now, current expiresAt) so prepaying doesn't burn unused time.
 */
export function extendedExpiry(current: Date | null, months: number): Date {
  const now = new Date();
  const base = current && current.getTime() > now.getTime() ? new Date(current) : now;
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Hardcoded bank transfer info displayed to users awaiting deposit. */
export const BANK_INFO = {
  bank: "우리은행",
  accountNumber: "1005-804-658161",
  accountHolder: "(주)홈앤샵",
  supportEmail: "help@homenshop.com",
} as const;

/** Generate a deterministic order number for subscription orders. */
export function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SUB-${y}${m}${d}-${rand}`;
}
