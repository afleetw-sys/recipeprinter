// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { proStatusKnown, useRunWhenKnown } from "./proStatusGate";

/**
 * A Pro member who clicked "Add more" (or "Try another way") right after
 * signing in was shown the upgrade dialog: neither RevenueCat nor the
 * account's saved entitlements had answered, so the page read them as free.
 * Seen as a flake in e2e/try-another-way.spec.ts, where the Add dialog never
 * opened because the Pro dialog had.
 */
describe("Pro status gate", () => {
  test("a gated click before Pro status is known waits for it, then runs once against the answer", () => {
    // Known only once something has answered for a signed-in account.
    const cases: [Parameters<typeof proStatusKnown>[0], boolean][] = [
      [{ authReady: false, signedIn: false, liveStatus: "idle", profileSettled: false }, false],
      [{ authReady: true, signedIn: false, liveStatus: "idle", profileSettled: false }, true],
      [{ authReady: true, signedIn: true, liveStatus: "idle", profileSettled: false }, false],
      [{ authReady: true, signedIn: true, liveStatus: "error", profileSettled: false }, false],
      [{ authReady: true, signedIn: true, liveStatus: "ok", profileSettled: false }, true],
      [{ authReady: true, signedIn: true, liveStatus: "error", profileSettled: true }, true],
    ];
    for (const [input, known] of cases) expect(proStatusKnown(input), JSON.stringify(input)).toBe(known);

    // The click is held, then run with what the page knows after the answer.
    const ran: string[] = [];
    const { result, rerender } = renderHook(
      ({ known, pro }: { known: boolean; pro: boolean }) =>
        useRunWhenKnown<string>(known, (what) => ran.push(`${what}:${pro ? "pro" : "free"}`)),
      { initialProps: { known: false, pro: false } },
    );
    result.current("add-more");
    rerender({ known: false, pro: false });
    expect(ran).toEqual([]);
    rerender({ known: true, pro: true });
    rerender({ known: true, pro: true });
    expect(ran).toEqual(["add-more:pro"]);
  });
});
