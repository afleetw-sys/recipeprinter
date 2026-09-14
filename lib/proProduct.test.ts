import { describe, expect, test } from "vitest";
import { proAnnualSavingsPercent } from "./proProduct";

describe("proAnnualSavingsPercent", () => {
  test("matches the advertised $4.99/mo vs $39.99/yr prices", () => {
    // $4.99 * 12 = $59.88 a year at the monthly rate; $39.99 is what annual
    // actually costs. The dialog must never claim more than this.
    expect(proAnnualSavingsPercent()).toBe(33);
  });

  test("rounds down rather than up, so the claim is never optimistic", () => {
    const percent = proAnnualSavingsPercent();
    expect(Number.isInteger(percent)).toBe(true);
    expect(percent).toBeLessThanOrEqual(33.216_5);
  });
});
