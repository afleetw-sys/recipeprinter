import { describe, expect, it } from "vitest";
import { parseCoverInches, sanitizeDecimal } from "@/lib/coverSizeInput";

/** What a cover box does with what is typed into it: keeps it, then reads it. */
const typedInto = (typed: string) => parseCoverInches(sanitizeDecimal(typed));

describe("a cover size box", () => {
  it("reads a cover size however the cook types it", () => {
    // A comma decimal, as most of the world writes one, lost its comma: 17,25
    // became 1725 inches, and a spine typed as 0,25 sat at 0 on the way and
    // left Download cover disabled while every box looked filled in.
    const cases: [string, number][] = [
      ["17.25", 17.25],
      [" 17.25 ", 17.25],
      ['17.25"', 17.25],
      ["17.25″", 17.25],
      ["17.25 in", 17.25],
      ["17.25 inches", 17.25],
      ["17,25", 17.25],
      ["0,4823", 0.4823],
      [",48", 0.48],
      [".48", 0.48],
    ];
    for (const [typed, inches] of cases) {
      expect(typedInto(typed), JSON.stringify(typed)).toBeCloseTo(inches, 6);
    }
  });

  it("still refuses what is not a size", () => {
    for (const typed of ["", "   ", "0", ".", "abc"]) {
      expect(typedInto(typed), JSON.stringify(typed)).toBeNull();
    }
  });
});
