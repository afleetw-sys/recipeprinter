"use client";

/**
 * Give a promise a deadline.
 *
 * For the promises that can simply never answer. Firestore's `getDocs` is the
 * one this was written for: it has no timeout of its own, so against a network
 * that is blocked rather than broken it neither resolves nor rejects, and a
 * `.finally` that clears a spinner never runs. A failure is easy to render; a
 * promise that stays pending forever is a spinner nobody can get out of.
 *
 * A race, not a cancellation — the underlying work has no abort and keeps
 * going. That is deliberate for a read: if it does land after the deadline the
 * caller has usually cached it, and the next attempt is instant. Never use this
 * to bound a WRITE, where "gave up waiting" and "did not happen" are not the
 * same thing and the caller would be wrong to assume the second.
 */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  // Clear the timer either way, so a promise that settles first doesn't leave a
  // pending handle holding a Node process (or a React test) open.
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Thrown by `withTimeout` so a caller can tell a deadline from a real error. */
export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}
