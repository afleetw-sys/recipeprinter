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

  it("has a line for every import method, including ones with no dedicated case", () => {
    const methods = ["url", "image", "text", "cookpilot", "paprika", "shared", "manual"] as const;
    for (const method of methods) {
      const label = importLoadingLabel({ method, source: "x" });
      expect(label.length).toBeGreaterThan(0);
      expect(label.endsWith("…")).toBe(true);
    }
  });
});
