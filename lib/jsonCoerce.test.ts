import { describe, expect, it } from "vitest";
import { asNumber, asRecord, asString } from "@/lib/jsonCoerce";

describe("asString", () => {
  it("trims, and treats blank as absent", () => {
    expect(asString("  chocolate  ")).toBe("chocolate");
    expect(asString("")).toBeUndefined();
    expect(asString("   ")).toBeUndefined();
  });

  it("renders a finite number, because these sources type counts both ways", () => {
    expect(asString(4)).toBe("4");
    expect(asString(0)).toBe("0");
    expect(asString(1.5)).toBe("1.5");
  });

  // The drift this module exists to end: three of the four private copies
  // returned the string "NaN" here, which prints. Firestore can store NaN, so
  // this is a real value, not a hypothetical one.
  it("refuses a non-finite number rather than printing its name", () => {
    expect(asString(Number.NaN)).toBeUndefined();
    expect(asString(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(asString(Number.NEGATIVE_INFINITY)).toBeUndefined();
  });

  it("is undefined for everything else", () => {
    expect(asString(undefined)).toBeUndefined();
    expect(asString(null)).toBeUndefined();
    expect(asString(true)).toBeUndefined();
    expect(asString({})).toBeUndefined();
    expect(asString(["a"])).toBeUndefined();
  });
});

describe("asNumber", () => {
  it("takes finite numbers only", () => {
    expect(asNumber(12)).toBe(12);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-3.5)).toBe(-3.5);
    expect(asNumber(Number.NaN)).toBeUndefined();
    expect(asNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  // Deliberate: a caller that needs "600" or "600px" is asking a narrower
  // question and declares its own helper (see `dimensionPx` in
  // lib/recipeImages.ts). Widening this one would widen every consumer's type.
  it("does not parse numeric strings", () => {
    expect(asNumber("12")).toBeUndefined();
    expect(asNumber("600px")).toBeUndefined();
    expect(asNumber(null)).toBeUndefined();
  });
});

describe("asRecord", () => {
  it("passes objects through and rejects primitives", () => {
    const value = { a: 1 };
    expect(asRecord(value)).toBe(value);
    expect(asRecord(null)).toBeNull();
    expect(asRecord(undefined)).toBeNull();
    expect(asRecord("x")).toBeNull();
    expect(asRecord(7)).toBeNull();
  });

  it("passes an array, which callers that care test themselves", () => {
    expect(asRecord([1, 2])).not.toBeNull();
  });
});
