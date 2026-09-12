import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDeadline } from "@/lib/server/requestDeadline";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/* These assert on `budgetFor`, not on when a signal actually fires.
   `AbortSignal.timeout` is backed by Node's internal timers rather than the
   global `setTimeout` fake timers patch, so a test that waited on one would
   either hang or have to sleep for real. How long the platform waits is the
   platform's business; the decision that belongs to this module is which of
   the two budgets wins, and that is a number. */

describe("requestDeadline", () => {
  it("gives a leg its full budget while the request has room to spare", () => {
    const deadline = requestDeadline(85_000);
    expect(deadline.budgetFor(55_000)).toBe(55_000);
  });

  it("caps a leg at what is left, not at its own budget", () => {
    const deadline = requestDeadline(85_000);
    // The CookPilot leg has already spent 55s and our fetch another 20s, so the
    // last leg's nominal 20s does not fit — this is the case that used to push
    // the route past maxDuration.
    vi.advanceTimersByTime(75_000);
    expect(deadline.budgetFor(20_000)).toBe(10_000);
  });

  it("leaves nothing to spend once the budget is gone", () => {
    const deadline = requestDeadline(85_000);
    vi.advanceTimersByTime(85_000);
    expect(deadline.remainingMs()).toBe(0);
    expect(deadline.budgetFor(20_000)).toBe(0);
  });

  it("never reports negative time left once the budget is overspent", () => {
    const deadline = requestDeadline(85_000);
    vi.advanceTimersByTime(120_000);
    expect(deadline.remainingMs()).toBe(0);
    expect(deadline.budgetFor(20_000)).toBe(0);
  });

  /* The sum that started this. Every leg in series, worst case, must land
     inside the budget — which is the property the route's own constants could
     not state and therefore could not keep. */
  it("holds the whole chain of legs inside the budget", () => {
    const BUDGET = 85_000;
    const deadline = requestDeadline(BUDGET);
    // 55s CookPilot + four 20s redirect hops + 20s supplied-html = 155s of
    // nominal per-leg budget, well past the platform ceiling.
    const legs = [55_000, 20_000, 20_000, 20_000, 20_000, 20_000];

    let spent = 0;
    for (const leg of legs) {
      const waited = deadline.budgetFor(leg);
      vi.advanceTimersByTime(waited);
      spent += waited;
    }

    expect(spent).toBe(BUDGET);
    expect(deadline.remainingMs()).toBe(0);
  });

  it("flags only the legs the request budget actually squeezes", () => {
    const deadline = requestDeadline(85_000);
    expect(deadline.isBinding(20_000)).toBe(false);

    vi.advanceTimersByTime(70_000);
    expect(deadline.isBinding(20_000)).toBe(true);
    // Still false for a leg small enough to fit in what remains.
    expect(deadline.isBinding(10_000)).toBe(false);
  });

  it("still produces a usable signal at each end of the range", () => {
    const deadline = requestDeadline(85_000);
    expect(deadline.signal(20_000).aborted).toBe(false);

    vi.advanceTimersByTime(85_000);
    // Zero budget must still hand back a signal rather than throwing — the
    // caller's job is to report an aborted leg, not to check the clock first.
    expect(deadline.signal(20_000)).toBeInstanceOf(AbortSignal);
  });
});
