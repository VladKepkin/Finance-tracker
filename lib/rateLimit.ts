interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const MAX_MAP_SIZE = 5000;

function cleanupExpired(now: number): void {
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * In-memory sliding-window-style (fixed reset window) rate limiter.
 *
 * @param key - Unique rate-limiting key (e.g. IP or IP:username)
 * @param limit - Maximum allowed requests within the window
 * @param windowMs - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  if (rateLimitMap.size > MAX_MAP_SIZE) {
    cleanupExpired(now);
  }

  const existing = rateLimitMap.get(key);

  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count < limit) {
    existing.count++;
    return { allowed: true, retryAfterSec: 0 };
  }

  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return { allowed: false, retryAfterSec };
}

/**
 * Resets all active rate limit counters (useful for unit tests).
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}

/**
 * Extracts client IP from request headers (x-forwarded-for first, then x-real-ip),
 * or returns "unknown".
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  return "unknown";
}
