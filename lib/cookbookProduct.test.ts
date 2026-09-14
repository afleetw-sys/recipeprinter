import { describe, expect, test } from "vitest";
import { isFirstCookbookDiscountEligible } from "./cookbookProduct";

describe("isFirstCookbookDiscountEligible", () => {
  test("a Pro subscriber who has never had a cookbook grant is eligible", () => {
    expect(
      isFirstCookbookDiscountEligible({ hasPro: true, firstCookbookGrantedAt: null }),
    ).toBe(true);
  });

  test("a Pro subscriber who already has a cookbook grant is not eligible", () => {
    expect(
      isFirstCookbookDiscountEligible({ hasPro: true, firstCookbookGrantedAt: Date.now() }),
    ).toBe(false);
  });

  test("a non-Pro user is never eligible, even with no prior grant", () => {
    expect(
      isFirstCookbookDiscountEligible({ hasPro: false, firstCookbookGrantedAt: null }),
    ).toBe(false);
  });

  test("a non-Pro user with a prior grant is not eligible either", () => {
    expect(
      isFirstCookbookDiscountEligible({ hasPro: false, firstCookbookGrantedAt: Date.now() }),
    ).toBe(false);
  });

  test("eligibility flips to false the instant firstCookbookGrantedAt moves off null — the exact transition the same-session optimistic update relies on", () => {
    const beforeGrant = isFirstCookbookDiscountEligible({ hasPro: true, firstCookbookGrantedAt: null });
    const afterGrant = isFirstCookbookDiscountEligible({ hasPro: true, firstCookbookGrantedAt: Date.now() });
    expect(beforeGrant).toBe(true);
    expect(afterGrant).toBe(false);
  });
});
