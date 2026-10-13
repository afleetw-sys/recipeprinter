/**
 * "You're on Pro" moments, announced from wherever they happen (a purchase in
 * any of the three Pro checkouts, a referral claim on sign-in, a reward that
 * landed while the referrer was away) and shown once by `ReferralHost`, which
 * is mounted in the root layout.
 *
 * Also the one signal that Pro just changed, so pages holding a customerInfo
 * read it again instead of waiting for a reload.
 */

export type ProWelcome =
  | { kind: "purchased" }
  | { kind: "referral_welcome"; days: number }
  | {
    kind: "referral_earned";
    days: number;
    fulfillment: "promo" | "extension";
    /** A subscriber's next renewal after the extension, as RevenueCat reports it. */
    renewsAtMs?: number | null;
  };

const listeners = new Set<(welcome: ProWelcome) => void>();

export function announceProWelcome(welcome: ProWelcome): void {
  listeners.forEach((listener) => listener(welcome));
  announceProChanged();
}

export function subscribeProWelcome(listener: (welcome: ProWelcome) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const PRO_CHANGED_EVENT = "recipeprinter:pro-changed";

/** Pro was granted or extended outside a purchase this page made. */
export function announceProChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRO_CHANGED_EVENT));
}
