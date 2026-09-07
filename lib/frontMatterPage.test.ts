import { describe, expect, it } from "vitest";
import { openingPageFor } from "@/lib/frontMatterPage";

const template = "classic" as const;

describe("the book's opening page", () => {
  it("takes the page from the opening-page editor", () => {
    // The bug this exists to prevent: the export read `dedication` alone, so a
    // page written here appeared in the preview and was absent from the PDF.
    const page = openingPageFor({
      frontMatter: { kind: "dedication", heading: "For Grandma", body: "Who taught us all." },
      template,
    });
    expect(page?.title).toBe("For Grandma");
    expect(page?.blurb).toBe("Who taught us all.");
  });

  it("falls back to the older dedication field", () => {
    const dedication = { title: "For Grandma", template };
    expect(openingPageFor({ dedication, template })).toBe(dedication);
  });

  it("prefers the newer field when both are set", () => {
    const page = openingPageFor({
      frontMatter: { kind: "introduction", heading: "Introduction", body: "A note." },
      dedication: { title: "Stale", template },
      template,
    });
    expect(page?.title).toBe("Introduction");
  });

  it("names an untitled page by what kind it is", () => {
    expect(
      openingPageFor({ frontMatter: { kind: "dedication", body: "No heading." }, template })?.title,
    ).toBe("Dedication");
    expect(
      openingPageFor({ frontMatter: { kind: "introduction", body: "No heading." }, template })
        ?.title,
    ).toBe("Introduction");
  });

  it("is absent when nothing has been written", () => {
    expect(openingPageFor({ template })).toBeUndefined();
    // Whitespace is not a page. An empty record left behind by opening the
    // editor and typing nothing must not add a leaf to the book — and, because
    // front-matter length decides the parity blank, must not shift every page
    // after it either.
    expect(
      openingPageFor({ frontMatter: { kind: "dedication", heading: "  ", body: "  " }, template }),
    ).toBeUndefined();
  });
});
