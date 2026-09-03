import { describe, expect, it } from "vitest";
import { PHOTO_MAX_DIMENSION, fitWithin } from "./coverPhoto";

describe("fitWithin (photo normalization sizing)", () => {
  it("leaves a photo already under the cap alone", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800, scaled: false });
  });

  it("never upscales a small photo to the cap", () => {
    const { width, height, scaled } = fitWithin(320, 240);
    expect({ width, height }).toEqual({ width: 320, height: 240 });
    expect(scaled).toBe(false);
  });

  it("caps the LONG edge, whichever way the photo is turned", () => {
    expect(fitWithin(6000, 4000, 2560)).toEqual({ width: 2560, height: 1707, scaled: true });
    expect(fitWithin(4000, 6000, 2560)).toEqual({ width: 1707, height: 2560, scaled: true });
  });

  it("holds the aspect ratio through the downscale", () => {
    const { width, height } = fitWithin(4032, 3024, 2560);
    expect(width / height).toBeCloseTo(4032 / 3024, 3);
  });

  it("keeps a photo at exactly the cap untouched", () => {
    expect(fitWithin(2560, 1440, 2560)).toEqual({ width: 2560, height: 1440, scaled: false });
  });

  it("never rounds a sliver of a photo away to nothing", () => {
    // A 10000x3 panorama scales to 2560x0.77 — which must not round to a zero
    // height, because a canvas of height 0 encodes to an empty image.
    const { width, height } = fitWithin(10000, 3, 2560);
    expect(width).toBe(2560);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("survives a degenerate zero-sized image without dividing by zero", () => {
    const { width, height } = fitWithin(0, 0);
    expect(Number.isFinite(width) && Number.isFinite(height)).toBe(true);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("puts a full-page photo at or above 300dpi across the widest sheet", () => {
    // The spiral preset trims to 8.5in; that is what the cap is sized from.
    expect(PHOTO_MAX_DIMENSION / 8.5).toBeGreaterThanOrEqual(300);
  });
});
