import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitsForTest, callerKey, rateLimit } from "@/lib/server/rateLimit";

beforeEach(() => {
  __resetRateLimitsForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows up to the limit and refuses the one after", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("a", 3, 1000).ok).toBe(true);
    }
    expect(rateLimit("a", 3, 1000).ok).toBe(false);
  });

  it("counts each caller separately", () => {
    expect(rateLimit("a", 1, 1000).ok).toBe(true);
    expect(rateLimit("a", 1, 1000).ok).toBe(false);
    // A different caller must be unaffected by the first one's spending.
    expect(rateLimit("b", 1, 1000).ok).toBe(true);
  });

  it("lets a refused caller back in once the window rolls over", () => {
    expect(rateLimit("a", 1, 1000).ok).toBe(true);
    expect(rateLimit("a", 1, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit("a", 1, 1000).ok).toBe(true);
  });

  it("reports how long to wait, in whole seconds, never zero", () => {
    rateLimit("a", 1, 5000);
    const refused = rateLimit("a", 1, 5000);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(5);
  });

  // The window is fixed, not sliding: spending the budget then waiting it out
  // must restore the FULL budget, not one request.
  it("restores the whole budget after the window, not a single request", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", 3, 1000);
    expect(rateLimit("a", 3, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("a", 3, 1000).ok).toBe(true);
    }
    expect(rateLimit("a", 3, 1000).ok).toBe(false);
  });
});

describe("callerKey", () => {
  const req = (headers: Record<string, string>) => new Request("https://x.test", { headers });

  it("takes the leftmost forwarded address", () => {
    expect(callerKey(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(callerKey(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  // An unidentifiable caller shares one bucket rather than escaping the limit —
  // that caller is precisely the one worth limiting.
  it("buckets an unidentifiable caller rather than exempting it", () => {
    const key = callerKey(req({}));
    expect(key).toBe("unknown");
    for (let i = 0; i < 2; i++) rateLimit(key, 2, 1000);
    expect(rateLimit(key, 2, 1000).ok).toBe(false);
  });
});
