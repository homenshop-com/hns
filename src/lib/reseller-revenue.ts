/**
 * Reseller revenue-sharing settlement ledger.
 *
 * Mirrors the AI credit ledger (src/lib/credits.ts): every change to a
 * reseller's settlement balance is one signed ResellerSettlement row, and the
 * cached Reseller.settlementBalance always equals the running sum. Rules:
 *
 *   1. Writes happen only via this module's functions. Never write
 *      `Reseller.settlementBalance` or insert `ResellerSettlement` rows
 *      directly from endpoint code.
 *   2. Every mutation is a Prisma `$transaction` that (a) re-reads the cached
 *      balance, (b) inserts a signed row with `balanceAfter`, (c) updates the
 *      cached `Reseller.settlementBalance`.
 *   3. `recordEarning` is idempotent on `refOrderId`: a re-fired PAID hook for
 *      the same order produces no second earning row. This is essential
 *      because the PAID transition fires from two places (admin bank-transfer
 *      confirm + Toss instant confirm).
 *
 * Scope: hosting SUBSCRIPTION orders only (product decision). The earning is
 * `floor(orderAmount * shareBps / 10000)` where shareBps is the reseller's
 * configured split (default 5000 = 50%).
 */

import { prisma } from "@/lib/db";
import type { ResellerSettlementKind } from "@/generated/prisma/client";

/** Compute a reseller's share of an order amount, in whole KRW. */
export function shareForOrder(orderAmount: number, shareBps: number): number {
  if (orderAmount <= 0 || shareBps <= 0) return 0;
  return Math.floor((orderAmount * shareBps) / 10000);
}

export interface RecordEarningOptions {
  resellerId: string;
  /** The PAID SUBSCRIPTION order. Used as the idempotency key. */
  refOrderId: string;
  /** The order's totalAmount in KRW (the full price the customer paid). */
  orderAmount: number;
  /**
   * Override the reseller's configured share rate. Normally omitted — the
   * reseller's current `revenueShareBps` is read inside the transaction.
   */
  shareBps?: number;
}

/**
 * Record a reseller's earning from a PAID hosting subscription order.
 *
 * Idempotent: if a settlement row already exists for `refOrderId`, this is a
 * no-op and returns the existing balance. Safe to call from both PAID hooks.
 *
 * Returns the reseller's settlement balance after the operation (unchanged on
 * a duplicate call or when the computed share is zero).
 */
export async function recordEarning(opts: RecordEarningOptions): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const reseller = await tx.reseller.findUnique({
      where: { id: opts.resellerId },
      select: { settlementBalance: true, revenueShareBps: true },
    });
    if (!reseller) {
      throw new Error(`recordEarning: reseller ${opts.resellerId} not found`);
    }

    // Idempotency: one earning row per order.
    const existing = await tx.resellerSettlement.findUnique({
      where: { refOrderId: opts.refOrderId },
      select: { id: true },
    });
    if (existing) return reseller.settlementBalance;

    const shareBps = opts.shareBps ?? reseller.revenueShareBps;
    const amount = shareForOrder(opts.orderAmount, shareBps);
    if (amount <= 0) return reseller.settlementBalance;

    const newBalance = reseller.settlementBalance + amount;
    await tx.resellerSettlement.create({
      data: {
        resellerId: opts.resellerId,
        amount,
        balanceAfter: newBalance,
        kind: "EARNING",
        refOrderId: opts.refOrderId,
        orderAmount: opts.orderAmount,
        shareBps,
      },
    });
    await tx.reseller.update({
      where: { id: opts.resellerId },
      data: { settlementBalance: newBalance },
    });
    return newBalance;
  });
}

export interface RecordPayoutOptions {
  resellerId: string;
  /** Positive KRW amount paid out to the reseller. */
  amount: number;
  adminUserId: string;
  note?: string;
}

/**
 * Record a payout to the reseller (admin action). Decreases the outstanding
 * settlement balance. The amount is given positive; it is stored as a negative
 * signed row.
 */
export async function recordPayout(opts: RecordPayoutOptions): Promise<number> {
  if (opts.amount <= 0) {
    throw new Error(`recordPayout requires positive amount; got ${opts.amount}`);
  }
  return prisma.$transaction(async (tx) => {
    const reseller = await tx.reseller.findUnique({
      where: { id: opts.resellerId },
      select: { settlementBalance: true },
    });
    if (!reseller) {
      throw new Error(`recordPayout: reseller ${opts.resellerId} not found`);
    }
    const newBalance = reseller.settlementBalance - opts.amount;
    await tx.resellerSettlement.create({
      data: {
        resellerId: opts.resellerId,
        amount: -opts.amount,
        balanceAfter: newBalance,
        kind: "PAYOUT",
        adminUserId: opts.adminUserId,
        note: opts.note ?? null,
      },
    });
    await tx.reseller.update({
      where: { id: opts.resellerId },
      data: { settlementBalance: newBalance },
    });
    return newBalance;
  });
}

export interface AdminAdjustOptions {
  resellerId: string;
  /** Signed KRW: positive credits the reseller, negative debits. */
  amount: number;
  adminUserId: string;
  note?: string;
}

/** Manual admin correction. Positive = credit, negative = debit. */
export async function adminAdjust(opts: AdminAdjustOptions): Promise<number> {
  if (opts.amount === 0) {
    return getBalance(opts.resellerId);
  }
  return prisma.$transaction(async (tx) => {
    const reseller = await tx.reseller.findUnique({
      where: { id: opts.resellerId },
      select: { settlementBalance: true },
    });
    if (!reseller) {
      throw new Error(`adminAdjust: reseller ${opts.resellerId} not found`);
    }
    const newBalance = reseller.settlementBalance + opts.amount;
    await tx.resellerSettlement.create({
      data: {
        resellerId: opts.resellerId,
        amount: opts.amount,
        balanceAfter: newBalance,
        kind: "ADJUSTMENT",
        adminUserId: opts.adminUserId,
        note: opts.note ?? null,
      },
    });
    await tx.reseller.update({
      where: { id: opts.resellerId },
      data: { settlementBalance: newBalance },
    });
    return newBalance;
  });
}

/** Cached settlement balance for a reseller. */
export async function getBalance(resellerId: string): Promise<number> {
  const r = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: { settlementBalance: true },
  });
  return r?.settlementBalance ?? 0;
}

export interface SettlementHistoryItem {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: ResellerSettlementKind;
  refOrderId: string | null;
  orderAmount: number | null;
  shareBps: number | null;
  note: string | null;
  createdAt: Date;
}

export async function getHistory(
  resellerId: string,
  limit = 50,
  offset = 0
): Promise<SettlementHistoryItem[]> {
  return prisma.resellerSettlement.findMany({
    where: { resellerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      amount: true,
      balanceAfter: true,
      kind: true,
      refOrderId: true,
      orderAmount: true,
      shareBps: true,
      note: true,
      createdAt: true,
    },
  });
}

export interface SettlementSummary {
  /** Outstanding balance owed to the reseller (cached). */
  balance: number;
  /** Lifetime gross earnings (sum of EARNING rows). */
  totalEarned: number;
  /** Lifetime payouts (absolute KRW paid out). */
  totalPaidOut: number;
}

export async function getSummary(resellerId: string): Promise<SettlementSummary> {
  const [reseller, earned, paidOut] = await Promise.all([
    prisma.reseller.findUnique({
      where: { id: resellerId },
      select: { settlementBalance: true },
    }),
    prisma.resellerSettlement.aggregate({
      where: { resellerId, kind: "EARNING" },
      _sum: { amount: true },
    }),
    prisma.resellerSettlement.aggregate({
      where: { resellerId, kind: "PAYOUT" },
      _sum: { amount: true },
    }),
  ]);
  return {
    balance: reseller?.settlementBalance ?? 0,
    totalEarned: earned._sum.amount ?? 0,
    totalPaidOut: Math.abs(paidOut._sum.amount ?? 0),
  };
}

/** Integrity check: recomputed ledger sum should equal the cached balance. */
export async function verifyBalance(
  resellerId: string
): Promise<{ cached: number; ledger: number; ok: boolean }> {
  const [reseller, agg] = await Promise.all([
    prisma.reseller.findUnique({
      where: { id: resellerId },
      select: { settlementBalance: true },
    }),
    prisma.resellerSettlement.aggregate({
      where: { resellerId },
      _sum: { amount: true },
    }),
  ]);
  const cached = reseller?.settlementBalance ?? 0;
  const ledger = agg._sum.amount ?? 0;
  return { cached, ledger, ok: cached === ledger };
}
