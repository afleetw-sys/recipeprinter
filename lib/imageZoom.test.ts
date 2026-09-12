import { describe, expect, it } from "vitest";
import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  clampImageZoom,
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
