import { describe, expect, it } from "vitest";
import { zoomFromWheel } from "./deckZoom";

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
