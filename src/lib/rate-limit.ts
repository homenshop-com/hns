// Simple in-memory rate limiter
// Resets on server restart — sufficient for basic bot protection

const attempts = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of attempts) {
    if (val.resetAt < now) attempts.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check if an IP is rate-limited.
 * @param ip - Client IP address
 * @param maxAttempts - Max attempts in the window (default: 5)
 * @param windowMs - Time window in ms (default: 15 minutes)
 * @returns true if allowed, false if rate-limited
 */
export function checkRateLimit(
  ip: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > maxAttempts) {
    return false;
  }

  return true;
}
