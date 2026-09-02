import { describe, expect, it } from "vitest";
import { ZOOM_DETENT, settleZoom, zoomFromWheel } from "./deckZoom";

const RANGE = { min: 0.25, max: 4 };
const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

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

describe("settleZoom", () => {
  it("eases onto a preset it stopped near", () => {
    expect(settleZoom(0.97, PRESETS)).toBe(1);
    expect(settleZoom(1.04, PRESETS)).toBe(1);
  });

  it("leaves a zoom that stopped between presets alone", () => {
    // 1.125 is the midpoint of 1 and 1.25, further than the detent from either.
    expect(settleZoom(1.125, PRESETS)).toBe(1.125);
  });

  it("pulls from exactly the detent distance, and not past it", () => {
    expect(settleZoom(1 + ZOOM_DETENT, PRESETS)).toBe(1);
    expect(settleZoom(1 + ZOOM_DETENT + 0.001, PRESETS)).not.toBe(1);
  });

  it("picks the nearer of two presets", () => {
    expect(settleZoom(1.21, PRESETS)).toBe(1.25);
    expect(settleZoom(1.05, PRESETS)).toBe(1);
  });

  it("returns the zoom untouched when there are no presets", () => {
    expect(settleZoom(1.37, undefined)).toBe(1.37);
    expect(settleZoom(1.37, [])).toBe(1.37);
  });
});
