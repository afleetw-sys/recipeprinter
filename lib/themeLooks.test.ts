import { describe, expect, it } from "vitest";
import { isCustomized, lookFor, normalizeThemeLooks, withLook } from "@/lib/themeLooks";

describe("theme background color", () => {
  it("defaults on for old and untouched themes", () => {
    expect(lookFor({}, "classic").background).toBe(true);
    expect(lookFor(normalizeThemeLooks({ classic: {} }, {}), "classic").background).toBe(true);
  });

  it("stores an off background per theme and restores the default cleanly", () => {
    const withoutBackground = withLook({}, "classic", { background: false });
    expect(withoutBackground).toEqual({ classic: { background: false } });
    expect(lookFor(withoutBackground, "classic").background).toBe(false);
    expect(lookFor(withoutBackground, "winter").background).toBe(true);
    expect(isCustomized(lookFor(withoutBackground, "classic"))).toBe(true);

    expect(withLook(withoutBackground, "classic", { background: true })).toEqual({});
  });

  it("reads the saved value defensively", () => {
    expect(lookFor(normalizeThemeLooks({ classic: { background: false } }, {}), "classic").background).toBe(false);
    expect(lookFor(normalizeThemeLooks({ classic: { background: "false" } }, {}), "classic").background).toBe(true);
  });
});
