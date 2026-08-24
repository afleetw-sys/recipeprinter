import { describe, expect, it } from "vitest";
import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  clampImageZoom,
  formatImageZoom,
  zoomByWheel,
} from "@/lib/imageZoom";

describe("clampImageZoom", () => {
  it("never zooms out past the cover fit, which would print paper down the sides", () => {
    expect(clampImageZoom(0.4)).toBe(IMAGE_ZOOM_MIN);
    expect(clampImageZoom(-2)).toBe(IMAGE_ZOOM_MIN);
  });

  it("stops at the maximum rather than magnifying to mush", () => {
    expect(clampImageZoom(12)).toBe(IMAGE_ZOOM_MAX);
  });

  it("treats any broken value as no zoom rather than as a huge one", () => {
    // A corrupted stored value should fall back to the plain cover crop, not
    // silently magnify someone's photo to the maximum.
    expect(clampImageZoom(Number.NaN)).toBe(IMAGE_ZOOM_MIN);
    expect(clampImageZoom(Number.POSITIVE_INFINITY)).toBe(IMAGE_ZOOM_MIN);
  });
});

describe("zoomByWheel", () => {
  it("zooms in on a pinch open and out on a pinch closed", () => {
    expect(zoomByWheel(1.5, -40)).toBeGreaterThan(1.5);
    expect(zoomByWheel(1.5, 40)).toBeLessThan(1.5);
  });

  it("is proportional, so the same gesture feels the same at any zoom", () => {
    const fromLow = zoomByWheel(1.2, -40) / 1.2;
    const fromHigh = zoomByWheel(2.4, -40) / 2.4;
    expect(fromLow).toBeCloseTo(fromHigh, 6);
  });

  it("stays inside the range however hard the gesture pushes", () => {
    expect(zoomByWheel(1, 5000)).toBe(IMAGE_ZOOM_MIN);
    expect(zoomByWheel(2.9, -5000)).toBe(IMAGE_ZOOM_MAX);
  });
});

describe("formatImageZoom", () => {
  it("reads as a whole percentage", () => {
    expect(formatImageZoom(1)).toBe("100%");
    expect(formatImageZoom(1.25)).toBe("125%");
    expect(formatImageZoom(1.333)).toBe("133%");
  });
});
