import { describe, expect, it } from "vitest";
import { printDocumentTitle } from "./printDocumentTitle";

describe("printDocumentTitle", () => {
  it("names a single recipe", () => {
    expect(printDocumentTitle(["Basil Pesto"])).toBe("Basil Pesto");
  });

  it("joins a pair, because two names still read in a file list", () => {
    expect(printDocumentTitle(["Basil Pesto", "Korean Beef Bowl"])).toBe(
      "Basil Pesto and Korean Beef Bowl",
    );
  });

  it("counts the rest once names stop being useful", () => {
    expect(
      printDocumentTitle(["Basil Pesto", "Korean Beef Bowl", "Bruschetta", "Caprese", "Cod"]),
    ).toBe("Basil Pesto, Korean Beef Bowl and 3 more");
  });

  it("says '1 more' rather than dropping the third silently", () => {
    expect(printDocumentTitle(["Pesto", "Beef", "Cod"])).toBe("Pesto, Beef and 1 more");
  });

  it("strips characters a file system will not take", () => {
    expect(printDocumentTitle(["Salt & Pepper Cod / Two Ways"])).toBe(
      "Salt & Pepper Cod Two Ways",
    );
    expect(printDocumentTitle(['Mac "n" Cheese: Baked'])).toBe("Mac n Cheese Baked");
  });

  it("ignores recipes with no usable title, and counts only what is left", () => {
    expect(printDocumentTitle(["Basil Pesto", undefined, "   ", "Bruschetta"])).toBe(
      "Basil Pesto and Bruschetta",
    );
  });

  it("returns null when nothing usable is left, so the caller keeps the page title", () => {
    expect(printDocumentTitle([])).toBeNull();
    expect(printDocumentTitle([undefined, "  ", "///"])).toBeNull();
  });

  it("trims a runaway name on a word boundary", () => {
    const long = "Slow Roasted Tomato and Garlic Confit with Burrata and Basil Oil".repeat(3);
    const out = printDocumentTitle([long])!;
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(" ")).toBe(false);
    // cut between words, not mid-word
    expect(long.startsWith(out)).toBe(true);
  });
});
