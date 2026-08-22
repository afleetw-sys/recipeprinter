import { describe, expect, it } from "vitest";
import { flipTransform, type FlipRect } from "@/lib/flipTransform";

const rect = (left: number, top: number, width: number, height: number): FlipRect => ({
  left,
  top,
  width,
  height,
});

describe("flipTransform", () => {
  // The studio hand-off: a card in the middle of the page becomes a row in the
  // rail, up and to the left. The transform has to point back at where it was.
  it("translates back toward the old position", () => {
    const t = flipTransform(rect(300, 400, 200, 60), rect(20, 100, 200, 60));
    expect(t).toBe("translate(280px, 300px) scale(1, 1)");
  });

  it("moves the other way when the element travels up and right", () => {
    const t = flipTransform(rect(20, 100, 100, 40), rect(300, 400, 100, 40));
    expect(t).toBe("translate(-280px, -300px) scale(1, 1)");
  });

  // Scale is old ÷ new — the element starts at its FORMER size and grows or
  // shrinks into its current one. Inverting this is the classic FLIP bug: it
  // still animates, just from visibly the wrong size.
  it("scales from the old size to the new one", () => {
    // Old is twice the new on both axes, so it starts at 2x and shrinks in.
    const t = flipTransform(rect(0, 0, 400, 200), rect(0, 0, 200, 100));
    expect(t).toBe("translate(0px, 0px) scale(2, 2)");
  });

  it("scales each axis independently", () => {
    // Twice as wide, half as tall: the two axes must not share a factor.
    const t = flipTransform(rect(0, 0, 400, 50), rect(0, 0, 200, 100));
    expect(t).toBe("translate(0px, 0px) scale(2, 0.5)");
  });

  it("handles growing as well as shrinking", () => {
    const t = flipTransform(rect(0, 0, 100, 50), rect(0, 0, 200, 200));
    expect(t).toBe("translate(0px, 0px) scale(0.5, 0.25)");
  });

  // The rail is display:none below 820px, so on a phone the target measures
  // 0x0. Dividing by that would produce Infinity and fling the element into
  // nowhere; the caller needs a null it can skip on.
  it("refuses a zero-area target rather than dividing by zero", () => {
    expect(flipTransform(rect(0, 0, 100, 50), rect(0, 0, 0, 0))).toBeNull();
    expect(flipTransform(rect(0, 0, 100, 50), rect(10, 10, 200, 0))).toBeNull();
  });

  it("refuses a zero-area source — nothing was on screen to fly from", () => {
    expect(flipTransform(rect(0, 0, 0, 0), rect(0, 0, 100, 50))).toBeNull();
  });

  it("refuses a missing rect", () => {
    expect(flipTransform(null, rect(0, 0, 100, 50))).toBeNull();
    expect(flipTransform(rect(0, 0, 100, 50), null)).toBeNull();
  });

  it("refuses a no-op, so nothing animates in place", () => {
    expect(flipTransform(rect(40, 40, 100, 50), rect(40, 40, 100, 50))).toBeNull();
  });
});
