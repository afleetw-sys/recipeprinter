import { describe, expect, it } from "vitest";
import {
  ORGANIZE_FILTER_OPTIONS,
  isOrganizeViewActive,
  matchesFilter,
  matchesOrganizeView,
  matchesSearch,
  type OrganizeRecipeContext,
} from "./organizeFilter";
import type { Recipe } from "@/types/recipe";

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  title: "Lemon Chicken",
  ingredients: [{ raw: "2 chicken thighs" }, { raw: "1 lemon, zested" }],
  instructions: [{ step: 1, text: "Roast until golden." }],
  image: "https://example.com/chicken.jpg",
  ...overrides,
});

const context = (
  overrides: Partial<Recipe> = {},
  extra: Partial<Omit<OrganizeRecipeContext, "item">> = {},
): OrganizeRecipeContext => ({
  item: {
    id: "r1",
    method: "url",
    source: "smittenkitchen.com",
    status: "ready",
    title: "Lemon Chicken",
    recipe: recipe(overrides),
    addedAt: 0,
  },
  chapterTitle: "Dinners",
  pageCount: 1,
  ...extra,
});

describe("matchesSearch", () => {
  const ready = context({
    description: "A weeknight favourite",
    note: "Grandma's version",
    tags: ["gluten-free"],
    cuisine: "Greek",
    ingredients: [{ raw: "1 tsp oregano", section: "For the marinade" }],
    instructions: [{ step: 1, text: "Marinate overnight.", section: "Day before" }],
  });

  // Every field the cook might remember a recipe by finds it.
  it.each([
    ["title", "lemon"],
    ["chapter", "dinners"],
    ["source site", "smitten"],
    ["notes", "grandma"],
    ["description", "weeknight"],
    ["tag", "gluten"],
    ["cuisine", "greek"],
    ["ingredient", "oregano"],
    ["ingredient group", "marinade"],
    ["step", "overnight"],
    ["step group", "day before"],
  ])("finds a recipe by its %s", (_field, query) => {
    expect(matchesSearch(query, ready)).toBe(true);
  });

  it("ignores case and accents in both directions", () => {
    expect(matchesSearch("CREME", context({ title: "Crème brûlée" }))).toBe(true);
    expect(matchesSearch("brûlée", context({ title: "Creme brulee" }))).toBe(true);
  });

  it("needs every word, in any order and in any field", () => {
    expect(matchesSearch("roast lemon", context())).toBe(true);
    expect(matchesSearch("lemon tofu", context())).toBe(false);
  });

  it("matches everything when the query is blank", () => {
    expect(matchesSearch("   ", context())).toBe(true);
  });

  it("still finds a recipe that has not finished parsing by its title", () => {
    const pending = context();
    pending.item = { ...pending.item, recipe: undefined, title: "Banana bread" };
    expect(matchesSearch("banana", pending)).toBe(true);
  });
});

describe("matchesFilter", () => {
  it("'no-photo' counts a chosen facing-page photo as a photo", () => {
    expect(matchesFilter("no-photo", context({ image: undefined }))).toBe(true);
    expect(matchesFilter("no-photo", context({ image: "  " }))).toBe(true);
    expect(matchesFilter("no-photo", context())).toBe(false);
    expect(
      matchesFilter(
        "no-photo",
        context({ image: undefined }, { placement: { heroImageUrl: "https://x/y.jpg" } }),
      ),
    ).toBe(false);
  });

  it("'no-ingredients' and 'no-steps' ignore blank lines", () => {
    const blank = context({ ingredients: [{ raw: " " }], instructions: [{ step: 1, text: "" }] });
    expect(matchesFilter("no-ingredients", blank)).toBe(true);
    expect(matchesFilter("no-steps", blank)).toBe(true);
    expect(matchesFilter("no-ingredients", context())).toBe(false);
    expect(matchesFilter("no-steps", context())).toBe(false);
  });

  it("'no-ingredients' reads ingredients stored as parts, not just whole lines", () => {
    expect(
      matchesFilter("no-ingredients", context({ ingredients: [{ amount: "1", name: "egg" }] })),
    ).toBe(false);
  });

  it("'no-chapter' is a blank chapter title", () => {
    expect(matchesFilter("no-chapter", context({}, { chapterTitle: " " }))).toBe(true);
    expect(matchesFilter("no-chapter", context())).toBe(false);
  });

  it("'two-pages' is a recipe whose card runs past one page", () => {
    expect(matchesFilter("two-pages", context({}, { pageCount: 2 }))).toBe(true);
    expect(matchesFilter("two-pages", context())).toBe(false);
  });

  // A finished recipe in a chapter must not be flagged by ANY readiness filter,
  // or the filters stop meaning "still needs work".
  it("a complete recipe passes no readiness filter", () => {
    for (const { value } of ORGANIZE_FILTER_OPTIONS) {
      expect(matchesFilter(value, context())).toBe(false);
    }
  });
});

describe("matchesOrganizeView", () => {
  const noPhoto = context({ image: undefined });
  const noSteps = context({ instructions: [] });

  it("shows a recipe with ANY of the ticked problems", () => {
    const view = { query: "", filters: ["no-photo", "no-steps"] as const };
    expect(matchesOrganizeView(view, noPhoto)).toBe(true);
    expect(matchesOrganizeView(view, noSteps)).toBe(true);
    expect(matchesOrganizeView(view, context())).toBe(false);
  });

  it("narrows the filtered recipes by the search", () => {
    expect(matchesOrganizeView({ query: "lemon", filters: ["no-photo"] }, noPhoto)).toBe(true);
    expect(matchesOrganizeView({ query: "tofu", filters: ["no-photo"] }, noPhoto)).toBe(false);
  });

  it("shows everything with no filters and no search", () => {
    expect(matchesOrganizeView({ query: "", filters: [] }, context())).toBe(true);
  });

  it("is only active with a filter or a non-blank query", () => {
    expect(isOrganizeViewActive({ query: " ", filters: [] })).toBe(false);
    expect(isOrganizeViewActive({ query: "x", filters: [] })).toBe(true);
    expect(isOrganizeViewActive({ query: "", filters: ["no-steps"] })).toBe(true);
  });
});
