/**
 * One clock for a whole request, so a chain of separately-budgeted legs cannot
 * outlast the function running them.
 *
 * The failure this exists to prevent is specific and had already happened once
 * on /api/parse. That route runs up to three network legs in series — the
 * CookPilot parser (55s), our own fetch of the page (20s per redirect hop, up
 * to four hops), then the shared parser reading the HTML we fetched (20s) —
 * each with its own `AbortSignal.timeout`. Every one of those numbers is
 * defensible on its own and their SUM was 95s against a `maxDuration` of 90.
 *
 * What that costs is not a little extra latency. It is the route's entire
 * catalogue of careful failure copy: past the platform ceiling the function is
 * killed where it stands, and "That website took too long to respond. Try
 * again, or paste the recipe text instead." is replaced by an opaque
 * FUNCTION_INVOCATION_TIMEOUT. Import failure is this product's most common
 * failure, so the messages are worth protecting.
 *
 * Per-leg budgets stay where they are and keep meaning what they mean — the
 * deadline only ever takes the SMALLER of a leg's budget and what is left. So
 * nothing that would have finished inside the budget is cut short, and the
 * arithmetic stops depending on anyone re-adding the constants by hand the next
 * time a leg is added.
 */

export interface Deadline {
  /** Milliseconds left in the request, floored at 0. */
  remainingMs(): number;
  /**
   * How long a leg may actually run: the smaller of its own budget and what is
   * left of the request's.
   *
   * The whole decision this module makes, as a number — which is what the tests
   * assert against. `signal` below is a wrapper over it, because how long
   * `AbortSignal.timeout(n)` waits is the platform's business, not ours.
   */
  budgetFor(legBudgetMs: number): number;
  /**
   * The abort signal for one leg.
   *
   * A signal at 0ms aborts immediately, which is the right answer — there is no
   * time left to spend, and every caller already handles an aborted leg in
   * words. Passed to `fetch`, this bounds the body read too: aborting a fetch
   * errors its response stream, so a streaming reader inherits the same
   * deadline without being handed one.
   */
  signal(legBudgetMs: number): AbortSignal;
  /**
   * True when the leg about to run is bounded by the REQUEST's budget rather
   * than by its own.
   *
   * For logging, not for control flow. A leg that trips this ran with less time
   * than it was designed for, which is the evidence for whether the legs ahead
   * of it are budgeted right — and it is invisible otherwise, because the leg
   * still returns a perfectly ordinary answer.
   */
  isBinding(legBudgetMs: number): boolean;
}

export function requestDeadline(budgetMs: number): Deadline {
  const endsAt = Date.now() + budgetMs;
  const remainingMs = () => Math.max(0, endsAt - Date.now());
  const budgetFor = (legBudgetMs: number) => Math.min(legBudgetMs, remainingMs());
  return {
    remainingMs,
    budgetFor,
    signal: (legBudgetMs) => AbortSignal.timeout(budgetFor(legBudgetMs)),
    isBinding: (legBudgetMs) => budgetFor(legBudgetMs) < legBudgetMs,
  };
}
