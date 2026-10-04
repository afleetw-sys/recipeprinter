import { describe, expect, it } from "vitest";
import { importLoadingLabel } from "@/lib/importProgress";

describe("importLoadingLabel", () => {
  it("names the site a link is being read from", () => {
    expect(importLoadingLabel({ method: "url", source: "allrecipes.com" })).toBe(
      "Getting the recipe from allrecipes.com…",
    );
  });

  it("names the photo being read", () => {
    expect(importLoadingLabel({ method: "image", source: "3 photos" })).toBe("Reading 3 photos…");
  });

  it("does not name a source for pasted text, which has no useful one", () => {
    // The item's `source` is the literal string "Pasted text"; echoing it back
    // as "Reading Pasted text…" reads like a filename.
    expect(importLoadingLabel({ method: "text", source: "Pasted text" })).toBe(
      "Reading your recipe…",
    );
  });

  it("falls back to the generic line when the source is missing or blank", () => {
    expect(importLoadingLabel({ method: "url", source: "" })).toBe("Getting the recipe…");
    expect(importLoadingLabel({ method: "image", source: "   " })).toBe("Reading your photo…");
  });

  it("cuts a long source short, whatever the import method", () => {
    // Recipe text pasted into the link box became a "hostname" of the whole
    // recipe run together, and the phone's loading sheet printed all of it
    // off the edge of the screen (PostHog replay, 2026-10-04).
    const long = "mexicanpicadilloingredients1lbgroundbeef(orgroundturkey)1onion2cloves";
    const methods = ["url", "image", "text", "cookpilot", "paprika", "shared", "manual"] as const;
    for (const method of methods) {
      const label = importLoadingLabel({ method, source: long });
      expect(label.length, method).toBeLessThanOrEqual(56);
      expect(label.endsWith("…"), method).toBe(true);
    }
  });

  it("has a line for every import method, including ones with no dedicated case", () => {
    const methods = ["url", "image", "text", "cookpilot", "paprika", "shared", "manual"] as const;
    for (const method of methods) {
      const label = importLoadingLabel({ method, source: "x" });
      expect(label.length).toBeGreaterThan(0);
      expect(label.endsWith("…")).toBe(true);
    }
  });
});
