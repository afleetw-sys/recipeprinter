import { describe, expect, it } from "vitest";
import { cookbookPdfFileName, trimSizeLabel } from "@/lib/cookbookPdfExport";
import { getCookbookPreset } from "@/lib/cookbookPresets";

describe("trimSizeLabel", () => {
  it("names the physical page size, dropping a trailing .0", () => {
    expect(trimSizeLabel(getCookbookPreset("us-letter"))).toBe("8.5x11");
    expect(trimSizeLabel(getCookbookPreset("hardcover-8x10"))).toBe("8x10");
  });
});

describe("cookbookPdfFileName", () => {
  it("carries the trim size, so a print shop's size question is answerable", () => {
    expect(cookbookPdfFileName("Our Favorite Recipes", "us-letter")).toBe(
      "Our-Favorite-Recipes-Spiral-8.5x11.pdf",
    );
    expect(cookbookPdfFileName("Our Favorite Recipes", "hardcover-8x10")).toBe(
      "Our-Favorite-Recipes-Hardcover-8x10.pdf",
    );
  });

  it("still distinguishes the two formats of the same book", () => {
    const a = cookbookPdfFileName("Family Table", "us-letter");
    const b = cookbookPdfFileName("Family Table", "hardcover-8x10");
    expect(a).not.toBe(b);
  });

  it("falls back to a usable name when the book is untitled", () => {
    expect(cookbookPdfFileName(undefined, "us-letter")).toBe("Cookbook-Spiral-8.5x11.pdf");
    expect(cookbookPdfFileName("   ", "us-letter")).toBe("Cookbook-Spiral-8.5x11.pdf");
    // Punctuation-only titles slug to nothing and must not yield "-Spiral-8.5x11.pdf".
    expect(cookbookPdfFileName("!!!", "us-letter")).toBe("Cookbook-Spiral-8.5x11.pdf");
  });
});
