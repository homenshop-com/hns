/**
 * AI credit ledger.
 *
 * Every credit change — grant, consumption, refund, admin adjust — goes through
 * this module. Rules:
 *
 *   1. Writes happen only via `grantCredits`, `consumeCredits`, `refundCredits`,
 *      `adminAdjust`. Never write `User.credits` or insert `CreditTransaction`
 *      rows directly from endpoint code.
 *   2. Every mutation is wrapped in a Prisma `$transaction` that (a) re-reads
 *      the balance, (b) inserts a signed CreditTransaction, (c) updates the
 *      cached `User.credits`. The cache is kept consistent with the ledger.
 *   3. Consumption is authorized: if balance < amount, an
 *      `InsufficientCreditsError` is thrown and nothing is written.
 *
 * To spend credits for a Claude API call, the recommended pattern is:
 *
 *     await consumeCredits(userId, { kind: "AI_EDIT", amount: CREDIT_COSTS.AI_EDIT, refSiteId });
 *     try {
 *       const result = await callClaude(...);
 *       return result;
 *     } catch (err) {
 *       // optional: refund on API failure so user isn't charged
 *       await refundCredits(userId, CREDIT_COSTS.AI_EDIT, { reason: "api_failure", refSiteId });
 *       throw err;
 *     }
 */

import { prisma } from "@/lib/db";
import type { Prisma, CreditTransactionKind } from "@/generated/prisma/client";

/* ───────── Public constants ───────── */

/** Cost in credits per AI operation. Keep in sync with /pricing UI. */
export const CREDIT_COSTS = {
  AI_SITE_CREATE: 50,
  AI_EDIT: 5,
  AI_OTHER: 2,
} as const;

/** Bonus credits granted on account creation (once per user). */
export const SIGNUP_BONUS = 20;

/** Monthly auto-grant for paid (1-year / 2-year / 3-year) plans. */
export const MONTHLY_GRANT_PAID = 100;

/** Credit pack catalog. Prices are in KRW. Used by /pricing and checkout. */
export interface CreditPack {
  id: string;
  credits: number;
  priceKrw: number;
  /** 10% / 20% / 27% etc. — display only, derived from unit price. */
  discountPct?: number;
  /** Show the "추천" ribbon on this pack. */
  recommended?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", credits: 100, priceKrw: 5_500 },
  { id: "standard", credits: 500, priceKrw: 25_000, discountPct: 10 },
  // PRO was priced at 66,000원 which collided exactly with the 1-year
  // hosting subscription price — admins couldn't tell at a glance which
  // a 66,000원 order was for, and users sometimes ordered the wrong one.
  // Bumped to 68,000원 to keep the two price points visibly distinct.
  { id: "pro", credits: 1_500, priceKrw: 68_000, discountPct: 17, recommended: true },
  { id: "enterprise", credits: 5_000, priceKrw: 200_000, discountPct: 27 },
];

export function findCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/* ───────── Errors ───────── */

export class InsufficientCreditsError extends Error {
  readonly balance: number;
  readonly required: number;
  constructor(balance: number, required: number) {
    super(`Insufficient credits: have ${balance}, need ${required}`);
    this.name = "InsufficientCreditsError";
    this.balance = balance;
    this.required = required;
  }
}

/* ───────── Types ───────── */

type TxClient = Prisma.TransactionClient;
type DbClient = typeof prisma | TxClient;

export interface ConsumeOptions {
  kind: Extract<CreditTransactionKind, "AI_SITE_CREATE" | "AI_EDIT" | "AI_OTHER">;
  amount: number;
  refSiteId?: string;
  aiModel?: string;
  description?: string;
}

export interface RefundOptions {
  refSiteId?: string;
  reason?: string;
}

export interface GrantOptions {
  kind: Extract<
    CreditTransactionKind,
    "SIGNUP_BONUS" | "MONTHLY_GRANT" | "PURCHASE" | "REFUND" | "ADMIN_GRANT"
  >;
  amount: number;
  refOrderId?: string;
  adminUserId?: string;
  description?: string;
}

/* ───────── Core ───────── */

/** Get current credit balance for a user (from cached User.credits). */
export async function getBalance(userId: string, db: DbClient = prisma): Promise<number> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u?.credits ?? 0;
}

/**
 * Generic positive-amount grant. Used by signup bonus, monthly auto-grant,
 * purchases, refunds, and admin adjustments.
 */
export async function grantCredits(
  userId: string,
  opts: GrantOptions
): Promise<number> {
  if (opts.amount <= 0) {
    throw new Error(`grantCredits requires positive amount; got ${opts.amount}`);
  }
  return prisma.$transaction(async (tx) => {
    const balance = await getBalance(userId, tx);
    const newBalance = balance + opts.amount;
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: opts.amount,
        balanceAfter: newBalance,
        kind: opts.kind,
        refOrderId: opts.refOrderId ?? null,
        adminUserId: opts.adminUserId ?? null,
        description: opts.description ?? null,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });
    return newBalance;
  });
}

/**
 * Atomically check balance and deduct credits. Throws InsufficientCreditsError
 * if the user lacks sufficient balance — nothing is written in that case.
 *
 * Returns the new balance after deduction.
 */
export async function consumeCredits(
  userId: string,
  opts: ConsumeOptions
): Promise<number> {
  if (opts.amount <= 0) {
    throw new Error(`consumeCredits requires positive amount; got ${opts.amount}`);
  }
  return prisma.$transaction(async (tx) => {
    const balance = await getBalance(userId, tx);
    if (balance < opts.amount) {
      throw new InsufficientCreditsError(balance, opts.amount);
    }
    const newBalance = balance - opts.amount;
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -opts.amount,
        balanceAfter: newBalance,
        kind: opts.kind,
        refSiteId: opts.refSiteId ?? null,
        aiModel: opts.aiModel ?? null,
        description: opts.description ?? null,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });
    return newBalance;
  });
}

/**
 * Credit the user back when a paid operation fails. Always safe to call —
 * even the user's cached balance will stay consistent.
 */
export async function refundCredits(
  userId: string,
  amount: number,
  opts: RefundOptions = {}
): Promise<number> {
  if (amount <= 0) return getBalance(userId);
  return grantCredits(userId, {
    kind: "REFUND",
    amount,
    description: opts.reason || "AI request failed",
  });
}

/**
 * Admin-initiated adjustment. Positive amount = grant, negative = debit.
 * Debits can drive balance negative (admin override) but are rare; normal
 * consumption paths use `consumeCredits`.
 */
export async function adminAdjust(
  userId: string,
  amount: number,
  adminUserId: string,
  description?: string
): Promise<number> {
  if (amount === 0) return getBalance(userId);
  return prisma.$transaction(async (tx) => {
    const balance = await getBalance(userId, tx);
    const newBalance = balance + amount;
    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        balanceAfter: newBalance,
        kind: amount > 0 ? "ADMIN_GRANT" : "ADMIN_DEBIT",
        adminUserId,
        description: description ?? null,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });
    return newBalance;
  });
}

/* ───────── History ───────── */

export interface CreditHistoryItem {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: CreditTransactionKind;
  description: string | null;
  refOrderId: string | null;
  refSiteId: string | null;
  createdAt: Date;
}

export async function getHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<CreditHistoryItem[]> {
  const rows = await prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      amount: true,
      balanceAfter: true,
      kind: true,
      description: true,
      refOrderId: true,
      refSiteId: true,
      createdAt: true,
    },
  });
  return rows;
}

/** Integrity check: recomputed sum from ledger should equal User.credits. */
export async function verifyBalance(userId: string): Promise<{ cached: number; ledger: number; ok: boolean }> {
  const [user, agg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
    prisma.creditTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
  ]);
  const cached = user?.credits ?? 0;
  const ledger = agg._sum.amount ?? 0;
  return { cached, ledger, ok: cached === ledger };
}
