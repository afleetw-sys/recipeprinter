import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "@/types/recipe";

// An import that "worked" and was then rewritten by hand is one the parser read
// wrong. These pin when that is reported, and what the report carries.

const recordFailedImport = vi.fn(async () => true);
const track = vi.fn();
const memory = new Map<string, string>();

vi.mock("@/lib/failedImportCapture", () => ({ recordFailedImport }));
vi.mock("@/lib/analytics", () => ({ track }));

function recipe(ingredients: string[], steps: string[]): Recipe {
  return {
    title: "Chili",
    ingredients: ingredients.map((raw) => ({ raw })),
    instructions: steps.map((text, index) => ({ step: index + 1, text })),
  } as Recipe;
}

const READ = recipe(["2 cups beans", "1 onion Chop the onion and brown it"], ["Simmer everything for an hour"]);
const FIXED = recipe(
  ["2 cups beans", "1 onion", "1 lb chicken", "2 cups stock"],
  ["Chop the onion and brown it.", "Add the chicken and stock.", "Simmer for an hour."],
);

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  recordFailedImport.mockClear();
  track.mockClear();
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
        removeItem: (key: string) => memory.delete(key),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("counting changed lines", () => {
  it("counts lines removed, rewritten, and added", async () => {
    const { changedLineCount } = await import("@/lib/importCorrections");
    expect(changedLineCount(["a", "b", "c"], ["a", "b", "c"])).toBe(0);
    expect(changedLineCount(["a", "b", "c"], ["a", "B", "c"])).toBe(2);
    expect(changedLineCount(["a", "b"], ["a", "b", "c", "d"])).toBe(2);
  });

  it("treats a couple of touch-ups as fine and a rewrite as a wrong reading", async () => {
    const { looksCorrected } = await import("@/lib/importCorrections");
    expect(looksCorrected(1, 20)).toBe(false);
    expect(looksCorrected(2, 20)).toBe(false);
    expect(looksCorrected(4, 20)).toBe(true);
    expect(looksCorrected(2, 5)).toBe(true);
  });
});

describe("watching an import", () => {
  it("files one report with the paste, our reading and their fix once they have rewritten it", async () => {
    const { noteImported, noteRecipeEdited } = await import("@/lib/importCorrections");
    noteImported("item-1", "text", "Chili\n2 cups beans\n1 onion…", READ);
    noteRecipeEdited("item-1", FIXED);
    await vi.advanceTimersByTimeAsync(46_000);

    expect(recordFailedImport).toHaveBeenCalledTimes(1);
    const [meta, detail] = recordFailedImport.mock.calls[0] as unknown as [
      { category: string; source: string },
      { payload: string },
    ];
    expect(meta).toMatchObject({ category: "corrected_after_import", source: "text" });
    expect(detail.payload).toContain("=== WHAT THEY PASTED ===");
    expect(detail.payload).toContain("1 onion Chop the onion and brown it");
    expect(detail.payload).toContain("=== WHAT THEY CORRECTED IT TO ===");
    expect(detail.payload).toContain("Add the chicken and stock.");
    // Counts only in analytics, never the recipe.
    expect(track).toHaveBeenCalledWith("recipe_import_corrected", expect.objectContaining({ source: "text" }));
    expect(JSON.stringify(track.mock.calls)).not.toContain("onion");

    noteRecipeEdited("item-1", recipe(["x"], ["y"]));
    await vi.advanceTimersByTimeAsync(46_000);
    expect(recordFailedImport).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for small touch-ups", async () => {
    const { noteImported, noteRecipeEdited } = await import("@/lib/importCorrections");
    noteImported("item-2", "text", "…", FIXED);
    noteRecipeEdited("item-2", recipe(["2 cups beans", "1 onion", "1 lb chicken", "2 cups stock"], [
      "Chop the onion and brown it.",
      "Add the chicken and stock.",
      "Simmer for 90 minutes.",
    ]));
    await vi.advanceTimersByTimeAsync(46_000);
    expect(recordFailedImport).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("never watches a photo import, whose input is not text", async () => {
    const { noteImported, noteRecipeEdited } = await import("@/lib/importCorrections");
    noteImported("item-3", "image", "", READ);
    noteRecipeEdited("item-3", FIXED);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(recordFailedImport).not.toHaveBeenCalled();
  });
});
