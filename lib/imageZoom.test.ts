import { describe, expect, it } from "vitest";
import {
  IMAGE_ZOOM_FIT,
  IMAGE_ZOOM_FLOOR,
  IMAGE_ZOOM_MAX,
  clampImageZoom,
  formatImageZoom,
  minZoomFor,
  zoomByWheel,
} from "@/lib/imageZoom";

describe("minZoomFor", () => {
  it("gives a photo shaped like its page nothing to zoom out to", () => {
    expect(minZoomFor(1)).toBe(IMAGE_ZOOM_FIT);
    expect(minZoomFor(undefined)).toBe(IMAGE_ZOOM_FIT);
    // A sliver of crop is not a framing decision — same dead zone the drag uses.
    expect(minZoomFor(1.01)).toBe(IMAGE_ZOOM_FIT);
  });

  it("lets a cropped photo back out exactly as far as cover cropped it", () => {
    // Cover had to overshoot by 50% to fill the page, so 1/1.5 shows all of it.
    expect(minZoomFor(1.5)).toBeCloseTo(1 / 1.5, 6);
    expect(minZoomFor(2)).toBeCloseTo(0.5, 6);
  });

  it("stops before a wildly lopsided photo becomes a stamp", () => {
    expect(minZoomFor(20)).toBe(IMAGE_ZOOM_FLOOR);
  });
});

describe("clampImageZoom", () => {
  it("holds at the cover fit when no floor is offered", () => {
    expect(clampImageZoom(0.4)).toBe(IMAGE_ZOOM_FIT);
    expect(clampImageZoom(-2)).toBe(IMAGE_ZOOM_FIT);
  });

  it("allows zooming out to this photo's own floor", () => {
    expect(clampImageZoom(0.6, 0.5)).toBe(0.6);
    expect(clampImageZoom(0.2, 0.5)).toBe(0.5);
  });

  it("never takes a floor above the cover fit as licence to zoom past it", () => {
    expect(clampImageZoom(1.4, 2)).toBe(1.4);
    expect(clampImageZoom(0.9, 2)).toBe(IMAGE_ZOOM_FIT);
  });

  it("stops at the maximum rather than magnifying to mush", () => {
    expect(clampImageZoom(12)).toBe(IMAGE_ZOOM_MAX);
  });

  it("treats any broken value as the plain cover fit", () => {
    expect(clampImageZoom(Number.NaN, 0.5)).toBe(IMAGE_ZOOM_FIT);
    expect(clampImageZoom(Number.POSITIVE_INFINITY, 0.5)).toBe(IMAGE_ZOOM_FIT);
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

  it("pinches closed down to this photo's floor, and no further", () => {
    expect(zoomByWheel(1, 5000, 0.5)).toBe(0.5);
    // A photo with nothing to back out of stays at the fit.
    expect(zoomByWheel(1, 5000)).toBe(IMAGE_ZOOM_FIT);
  });

  it("stays inside the range however hard the gesture pushes", () => {
    expect(zoomByWheel(2.9, -5000)).toBe(IMAGE_ZOOM_MAX);
  });
});

describe("formatImageZoom", () => {
  it("reads as a whole percentage either side of the fit", () => {
    expect(formatImageZoom(1)).toBe("100%");
    expect(formatImageZoom(1.25)).toBe("125%");
    expect(formatImageZoom(0.667)).toBe("67%");
  });
});
