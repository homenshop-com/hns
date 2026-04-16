// PostgreSQL-backed rate limiter.
// Shared across PM2 instances and persists across restarts.
// Uses Prisma atomic upsert + conditional increment to avoid races.

import { prisma } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check if a key (typically scope + IP) is within rate limit.
 *
 * @param key          Unique identifier (e.g. "register:1.2.3.4")
 * @param maxAttempts  Max attempts allowed in the window (default 5)
 * @param windowMs     Window size in ms (default 15 minutes)
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
): Promise<RateLimitResult> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  try {
    // Atomic upsert: if the existing row has expired, reset to 1;
    // otherwise increment. Using a transaction with conditional update
    // avoids the read-then-write race typical of in-memory limiters.
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimit.findUnique({ where: { key } });

      if (!existing || existing.resetAt <= now) {
        // Fresh window
        return tx.rateLimit.upsert({
          where: { key },
          create: { key, count: 1, resetAt: windowEnd },
          update: { count: 1, resetAt: windowEnd },
        });
      }

      return tx.rateLimit.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
    });

    const allowed = row.count <= maxAttempts;
    return {
      allowed,
      remaining: Math.max(0, maxAttempts - row.count),
      resetAt: row.resetAt,
    };
  } catch (err) {
    // Fail-open: if the DB is unreachable, allow the request rather than
    // locking legitimate users out. Log so this is visible in monitoring.
    console.error("Rate limit check failed, falling back to allow:", err);
    return { allowed: true, remaining: maxAttempts, resetAt: windowEnd };
  }
}

/**
 * Extract the client IP from Next.js request headers.
 * Trusts x-forwarded-for because the app runs behind nginx;
 * defense-in-depth is nginx's job, not this helper's.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xreal = req.headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  return "unknown";
}

/**
 * Periodic cleanup — call from a cron / scheduled task to remove expired rows.
 * Not strictly required for correctness (expired rows are reset in place),
 * but keeps the table small.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return result.count;
}
