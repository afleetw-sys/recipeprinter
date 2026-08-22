/**
 * A fixed-window counter, in memory, for the expensive routes.
 *
 * Deliberately modest about what it is. Serverless functions scale out, so this
 * Map lives per warm instance — a determined attacker spreading requests across
 * instances gets more than the nominal limit. It is a speed bump, not a wall.
 *
 * It is still worth having. The thing being protected (`/api/cookbook-pdf`)
 * cold-starts Chromium and is allowed 300 seconds per call, so the cost of one
 * request is measured in gigabyte-seconds. Turning "unbounded" into "bounded per
 * instance, per window" removes the trivial denial-of-wallet loop, and the
 * entitlement check in front of it removes the anonymous caller entirely. A
 * durable limiter (Upstash, Vercel KV) is the next step if abuse ever shows up
 * in the logs; this deliberately has no dependency to add or key to manage.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Keeps the Map from growing without bound across a long-lived instance. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets — for a `Retry-After` header. */
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      // Cheapest possible eviction: drop everything already expired, and if that
      // frees nothing, drop the whole map. Both are safe — losing a counter can
      // only let a caller start a fresh window, never block a legitimate one.
      windows.forEach((w, k) => {
        if (w.resetAt <= now) windows.delete(k);
      });
      if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * The caller, as well as we can identify one.
 *
 * `x-forwarded-for` is a client-supplied header everywhere except behind a proxy
 * that overwrites it — which Vercel does — so the leftmost entry is the real
 * peer there. Falls back to a single shared bucket rather than to "unlimited",
 * because an unidentifiable caller is exactly the one worth limiting.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || request.headers.get("x-real-ip") || "unknown";
}

/** Exported for tests — a fixed-window counter is exactly the thing that quietly stops counting. */
export function __resetRateLimitsForTest() {
  windows.clear();
}
