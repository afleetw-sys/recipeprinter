import { describe, expect, test } from "vitest";
import { proAnnualSavingsPercent } from "./proProduct";

describe("proAnnualSavingsPercent", () => {
  test("rounds down rather than up, so the claim is never optimistic", () => {
    // $10/mo is $120 a year; $77.10 a year saves 35.75%, which must read as 35.
    expect(proAnnualSavingsPercent(10, 77.1)).toBe(35);
  });
});
