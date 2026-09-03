import { describe, expect, it } from "vitest";
import { formatRecipeTime } from "./time";

describe("formatRecipeTime", () => {
  it("normalizes a single stated duration", () => {
    expect(formatRecipeTime("PT30M")).toBe("30 min");
    expect(formatRecipeTime("PT1H30M")).toBe("1 hr 30 min");
    expect(formatRecipeTime(90)).toBe("1 hr 30 min");
  });

  it("keeps a stated RANGE as written", () => {
    // Straight off a pre-printed recipe card: "Cooking time 12 to 24 hrs."
    // Collapsing this to its upper bound tells the cook to run a crock pot for
    // a day when the card said it could be done in twelve hours.
    expect(formatRecipeTime("12 to 24 hrs.")).toBe("12 to 24 hrs.");
    expect(formatRecipeTime("1-2 hours")).toBe("1-2 hours");
    expect(formatRecipeTime("8 or more hours")).toBe("8 or more hours");
    expect(formatRecipeTime("at least 8 hours")).toBe("at least 8 hours");
    expect(formatRecipeTime("8+ hours")).toBe("8+ hours");
    expect(formatRecipeTime("2 1/2 hours")).toBe("2 1/2 hours");
    expect(formatRecipeTime("about 4 hours")).toBe("about 4 hours");
  });

  it("still normalizes a single value that merely looks informal", () => {
    // No qualifier here — one quantity, so it is safe to tidy.
    expect(formatRecipeTime("24 hrs.")).toBe("24 hr");
    expect(formatRecipeTime("45 minutes")).toBe("45 min");
  });

  it("still compounds a multi-unit duration, which is not a range", () => {
    expect(formatRecipeTime("1 hour 30 minutes")).toBe("1 hr 30 min");
  });

  it("passes through anything it cannot read", () => {
    expect(formatRecipeTime("overnight")).toBe("overnight");
  });
});
