import { describe, expect, it } from "vitest";
import { DEFAULT_CHAPTER_INTRO, chapterIntroFromRecipes } from "./chapterIntro";

/** The two-line ceiling the wording rules exist to respect. */
const LINE_BUDGET = 86;

describe("chapterIntroFromRecipes", () => {
  it("falls back to the generic line for an empty chapter", () => {
    expect(chapterIntroFromRecipes([])).toBe(DEFAULT_CHAPTER_INTRO);
    expect(chapterIntroFromRecipes(["   ", undefined])).toBe(DEFAULT_CHAPTER_INTRO);
  });

  it("names two recipes and counts the rest", () => {
    expect(
      chapterIntroFromRecipes([
        "Authentic Italian Pizza",
        "Bourbon Chicken",
        "A", "B", "C", "D", "E",
      ]),
    ).toBe("Authentic Italian Pizza, Bourbon Chicken, and 5 more recipes");
  });

  it("lists a whole short chapter rather than trailing off into 'and 1 more'", () => {
    expect(chapterIntroFromRecipes(["Pizza"])).toBe("Pizza");
    expect(chapterIntroFromRecipes(["Pizza", "Bourbon Chicken"])).toBe(
      "Pizza and Bourbon Chicken",
    );
    expect(chapterIntroFromRecipes(["Pizza", "Bourbon Chicken", "Grits"])).toBe(
      "Pizza, Bourbon Chicken, and Grits",
    );
    expect(
      chapterIntroFromRecipes([
        "Authentic Italian Pizza",
        "Bourbon Chicken",
        "Buttermilk Fried Chicken Sandwiches",
      ]),
    ).toBe("Authentic Italian Pizza, Bourbon Chicken, and Buttermilk Fried Chicken Sandwiches");
  });

  it("gives up a name at a time when the titles run long", () => {
    // Two long names plus a long tail overruns, so the second name goes.
    expect(
      chapterIntroFromRecipes([
        "Slow-Roasted Tomato and Garlic Soup",
        "Buttermilk Fried Chicken Sandwiches",
        ...Array.from({ length: 20 }, (_, index) => `Filler ${index}`),
      ]),
    ).toBe("Slow-Roasted Tomato and Garlic Soup and 21 more recipes");
    // The same two names fit once the tail is short enough to keep them.
    expect(
      chapterIntroFromRecipes([
        "Slow-Roasted Tomato Soup",
        "Buttermilk Fried Chicken",
        ...Array.from({ length: 40 }, (_, index) => `Filler ${index}`),
      ]),
    ).toBe("Slow-Roasted Tomato Soup, Buttermilk Fried Chicken, and 40 more recipes");
  });

  it("keeps the tail singular for a single unnamed recipe", () => {
    expect(
      chapterIntroFromRecipes([
        "Slow-Roasted Tomato and Garlic Soup",
        "Buttermilk Fried Chicken Sandwiches",
        "Skillet Cornbread with Honey Butter",
        "Grits",
      ]),
    ).toBe("Slow-Roasted Tomato and Garlic Soup and 3 more recipes");
    expect(chapterIntroFromRecipes(["Pizza", "Grits", "Cornbread", "Pie"])).toBe(
      "Pizza, Grits, and 2 more recipes",
    );
  });

  it("summarizes by count only when a single title would overrun the line", () => {
    const paragraph =
      "Grandma Eleanor's Christmas Morning Cinnamon Roll Casserole With Extra Brown Sugar Streusel and Cream Cheese Icing";
    expect(chapterIntroFromRecipes([paragraph])).toBe("1 recipe in this chapter");
    expect(chapterIntroFromRecipes([paragraph, "Grits", "Pizza"])).toBe(
      "3 recipes in this chapter",
    );
    // A merely long title is still worth naming — it fits.
    const long = "Grandma Eleanor's Christmas Morning Cinnamon Roll Casserole";
    expect(chapterIntroFromRecipes([long])).toBe(long);
  });

  it("tidies titles that carry stray whitespace or trailing punctuation", () => {
    expect(chapterIntroFromRecipes(["  Bourbon\n Chicken.  ", "Grits,"])).toBe(
      "Bourbon Chicken and Grits",
    );
  });

  it("names distinct dishes and lets duplicates fall into the count", () => {
    expect(chapterIntroFromRecipes(["Pizza", "pizza", "Grits", "Cornbread"])).toBe(
      "Pizza, Grits, and 2 more recipes",
    );
  });

  it("never runs past the opener's two-line intro column", () => {
    const words = ["Skillet", "Buttermilk", "Slow-Roasted", "Cornbread", "Chicken", "Pie", "à"];
    for (let seed = 0; seed < 400; seed += 1) {
      const titles = Array.from({ length: (seed % 12) + 1 }, (_, index) =>
        Array.from({ length: ((seed + index) % 7) + 1 }, (_, word) => words[(seed + index + word) % words.length]).join(" "),
      );
      expect(chapterIntroFromRecipes(titles).length).toBeLessThanOrEqual(LINE_BUDGET);
    }
  });
});
