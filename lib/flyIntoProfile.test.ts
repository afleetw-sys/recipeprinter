import { describe, expect, it } from "vitest";
import { flightVector, type FlightRect } from "@/lib/flyIntoProfile";

/** Where the clone's centre ends up, given the transform the vector describes. */
function landedCentre(from: FlightRect, to: FlightRect) {
  const { dx, dy, scale } = flightVector(from, to);
  return {
    x: from.left + dx + (from.width * scale) / 2,
    y: from.top + dy + (from.height * scale) / 2,
  };
}

const avatar: FlightRect = { left: 1200, top: 16, width: 36, height: 36 };

describe("the flight into the profile", () => {
  it("lands the page's centre on the avatar's centre", () => {
    const page: FlightRect = { left: 300, top: 120, width: 460, height: 600 };
    const landed = landedCentre(page, avatar);
    expect(landed.x).toBeCloseTo(avatar.left + avatar.width / 2);
    expect(landed.y).toBeCloseTo(avatar.top + avatar.height / 2);
  });

  /**
   * The bug this file was written for. Subtracting the source's own offset
   * twice still lands correctly for a page at the very top left, so a test that
   * only checked the origin would have passed while every real page — which is
   * scrolled some way down and inset from the left — flew wide.
   */
  it("lands correctly wherever the page happens to be sitting", () => {
    for (const page of [
      { left: 0, top: 0, width: 400, height: 520 },
      { left: 640, top: 900, width: 400, height: 520 },
      { left: 12, top: -300, width: 400, height: 520 },
    ] satisfies FlightRect[]) {
      const landed = landedCentre(page, avatar);
      expect(landed.x).toBeCloseTo(avatar.left + avatar.width / 2);
      expect(landed.y).toBeCloseTo(avatar.top + avatar.height / 2);
    }
  });

  it("shrinks the page to the avatar's width", () => {
    const page: FlightRect = { left: 300, top: 120, width: 360, height: 470 };
    expect(flightVector(page, avatar).scale).toBeCloseTo(36 / 360);
  });

  // A page that disappears entirely before it arrives reads as a glitch.
  it("never shrinks to nothing, however large the page", () => {
    const huge: FlightRect = { left: 0, top: 0, width: 20_000, height: 26_000 };
    expect(flightVector(huge, avatar).scale).toBe(0.04);
  });
});
