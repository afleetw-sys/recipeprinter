import { describe, expect, it } from "vitest";
import { isAllCaps, isTitleCase, toAllCaps, toTitleCase } from "@/lib/titleCase";

describe("toTitleCase", () => {
  it("brings a shouting title down to Title Case", () => {
    expect(toTitleCase("CHICKEN TIKKA MASALA")).toBe("Chicken Tikka Masala");
  });

  it("keeps small words small, except first, last and after a colon", () => {
    expect(toTitleCase("PASTA WITH GARLIC AND OIL")).toBe("Pasta with Garlic and Oil");
    expect(toTitleCase("THE BEST SOUP TO GO WITH")).toBe("The Best Soup to Go With");
    expect(toTitleCase("PASTA NIGHT: A CACIO E PEPE")).toBe("Pasta Night: A Cacio e Pepe");
  });

  it("capitalizes each part of a hyphenated word and leaves apostrophes alone", () => {
    expect(toTitleCase("BEEF STIR-FRY")).toBe("Beef Stir-Fry");
    expect(toTitleCase("GRANDMA'S 5-INGREDIENT MAC")).toBe("Grandma's 5-Ingredient Mac");
  });

  it("skips leading punctuation to find a word's first letter", () => {
    expect(toTitleCase("“BEST EVER” BROWNIES")).toBe("“Best Ever” Brownies");
  });

  it("keeps an acronym in a title that was not all capitals", () => {
    expect(toTitleCase("easy BBQ chicken and rice")).toBe("Easy BBQ Chicken and Rice");
  });

  it("handles letters outside ASCII", () => {
    expect(toTitleCase("CRÈME BRÛLÉE")).toBe("Crème Brûlée");
  });
});

describe("case detection", () => {
  it("tells capitals from Title Case", () => {
    expect(isAllCaps("TOMATO BRUSCHETTA")).toBe(true);
    expect(isAllCaps("Tomato Bruschetta")).toBe(false);
    expect(isTitleCase("Tomato Bruschetta")).toBe(true);
    expect(isTitleCase("Tomato bruschetta")).toBe(false);
    expect(isTitleCase("TOMATO BRUSCHETTA")).toBe(false);
  });

  it("calls neither case active on a title with no letters", () => {
    expect(isAllCaps("123")).toBe(false);
    expect(isTitleCase("")).toBe(false);
  });

  it("goes to capitals", () => {
    expect(toAllCaps("Crème Brûlée")).toBe("CRÈME BRÛLÉE");
  });
});
