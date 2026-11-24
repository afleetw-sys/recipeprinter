import { describe, expect, it } from "vitest";
import { isCustomized, lookFor, normalizeThemeLooks, withLook } from "@/lib/themeLooks";

describe("theme background color", () => {
  it("defaults on for old and untouched themes", () => {
    expect(lookFor({}, "classic").background).toBe(true);
    expect(lookFor(normalizeThemeLooks({ classic: {} }, {}), "classic").background).toBe(true);
  });

  it("stores an off background per theme and restores the default cleanly", () => {
    const withoutBackground = withLook({}, "typewriter", { background: false });
    expect(withoutBackground).toEqual({ typewriter: { background: false } });
    expect(lookFor(withoutBackground, "typewriter").background).toBe(false);
    expect(lookFor(withoutBackground, "winter").background).toBe(true);
    expect(isCustomized(lookFor(withoutBackground, "typewriter"))).toBe(true);

    expect(withLook(withoutBackground, "typewriter", { background: true })).toEqual({});
  });

  it("reads the saved value defensively", () => {
    expect(lookFor(normalizeThemeLooks({ typewriter: { background: false } }, {}), "typewriter").background).toBe(false);
    expect(lookFor(normalizeThemeLooks({ typewriter: { background: "false" } }, {}), "typewriter").background).toBe(true);
    expect(normalizeThemeLooks({ winter: { background: false } }, {})).toEqual({});
    expect(withLook({}, "document", { background: false })).toEqual({});
  });
});
