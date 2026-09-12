import { describe, expect, it } from "vitest";
import { textBarScale, zoomFromWheel } from "./deckZoom";

const RANGE = { min: 0.25, max: 4 };

describe("zoomFromWheel", () => {
  it("pinching open zooms in, pinching closed zooms out", () => {
    expect(zoomFromWheel(1, -10, RANGE)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 10, RANGE)).toBeLessThan(1);
  });

  it("moves by the same proportion at every zoom level", () => {
    const lo = zoomFromWheel(0.5, -10, RANGE) / 0.5;
    const hi = zoomFromWheel(2, -10, RANGE) / 2;
    expect(lo).toBeCloseTo(hi, 10);
  });

  it("is continuous: two nearby deltas give two different values", () => {
    // The old code rounded to whole percents, so deltas this close collapsed
    // onto the same zoom and the gesture felt stepped.
    const a = zoomFromWheel(1, -1, RANGE);
    const b = zoomFromWheel(1, -1.4, RANGE);
    expect(a).not.toBe(b);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it("does not round to whole percents", () => {
    const z = zoomFromWheel(1, -1, RANGE);
    expect(z * 100).not.toBe(Math.round(z * 100));
  });

  it("clamps to the range at both ends", () => {
    expect(zoomFromWheel(3.9, -1000, RANGE)).toBe(RANGE.max);
    expect(zoomFromWheel(0.3, 1000, RANGE)).toBe(RANGE.min);
  });

  it("leaves the zoom alone when a delta would send it non-finite", () => {
    expect(zoomFromWheel(1, -Infinity, RANGE)).toBe(1);
    expect(zoomFromWheel(1, Number.NaN, RANGE)).toBe(1);
  });

  it("accumulates to the same place whether the fingers moved in one push or several", () => {
    const once = zoomFromWheel(1, -30, RANGE);
    let step = 1;
    for (let i = 0; i < 30; i++) step = zoomFromWheel(step, -1, RANGE);
    expect(step).toBeCloseTo(once, 10);
  });
});

describe("textBarScale", () => {
  it("leaves the bar exactly as it is at fit", () => {
    expect(textBarScale(1)).toBe(1);
  });

  it("gains a little at every step, so it is never receding", () => {
    const steps = [1.25, 1.5, 1.75, 2].map(textBarScale);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it("grows far more slowly than the card, so it never becomes a slab over the recipe", () => {
    expect(textBarScale(2)).toBeLessThan(1.5);
  });

  it("stays under the page toolbar above the card, which is 36px to this bar's 28", () => {
    expect(28 * textBarScale(2)).toBeLessThan(36);
    expect(28 * textBarScale(10)).toBeLessThan(36);
  });

  it("never shrinks below the size it is at fit", () => {
    expect(textBarScale(0.5)).toBe(1);
    expect(textBarScale(0.75)).toBe(1);
  });

  it("holds still for a zoom that is not a number", () => {
    expect(textBarScale(Number.NaN)).toBe(1);
    expect(textBarScale(Infinity)).toBe(1);
  });
});
