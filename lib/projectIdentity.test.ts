import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetProjectId,
  lookupProjectId,
  projectContentKey,
  rememberProjectId,
} from "@/lib/projectIdentity";
import type { QueueItem } from "@/types/recipe";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

function item(id: string, title: string, opts: { url?: string; first?: string } = {}): QueueItem {
  return {
    id,
    method: "url",
    source: "example.com",
    status: "ready",
    title,
    addedAt: 1,
    recipe: {
      title,
      sourceUrl: opts.url,
      ingredients: [{ name: opts.first ?? "flour" }],
      instructions: [{ step: 1, text: "Cook." }],
    },
  };
}

describe("recognising a project by its contents", () => {
  it("gives the same key however the recipes are ordered", () => {
    const a = [item("1", "Pancakes"), item("2", "Waffles")];
    const b = [item("9", "Waffles"), item("8", "Pancakes")];
    expect(projectContentKey(a, false)).toBe(projectContentKey(b, false));
  });

  // A cookbook someone may have paid for is not the same document as a free
  // card run, even built from exactly the same recipes.
  it("keeps a cookbook and a card run apart", () => {
    const items = [item("1", "Pancakes")];
    expect(projectContentKey(items, true)).not.toBe(projectContentKey(items, false));
  });

  /**
   * The trap the URL alone falls into: `multiRecipe` means one roundup page
   * yields many different recipes, so a URL names a page, not a dish.
   */
  it("separates recipes that share a source URL", () => {
    const roundup = "https://example.com/30-dinners";
    const a = [item("1", "Chili", { url: roundup })];
    const b = [item("2", "Tacos", { url: roundup })];
    expect(projectContentKey(a, false)).not.toBe(projectContentKey(b, false));
  });

  // Pasted and photographed recipes have no URL at all.
  it("separates same-titled recipes with no URL by their first ingredient", () => {
    const a = [item("1", "Pancakes", { first: "buckwheat" })];
    const b = [item("2", "Pancakes", { first: "semolina" })];
    expect(projectContentKey(a, false)).not.toBe(projectContentKey(b, false));
  });

  it("ignores recipes that aren't ready yet", () => {
    const ready = [item("1", "Pancakes")];
    const pending: QueueItem[] = [
      item("1", "Pancakes"),
      { id: "2", method: "url", source: "x.com", status: "parsing", title: "x.com", addedAt: 2 },
    ];
    expect(projectContentKey(pending, false)).toBe(projectContentKey(ready, false));
  });

  it("declines to key an empty or unidentifiable set, rather than matching everything", () => {
    expect(projectContentKey([], false)).toBeNull();
    expect(lookupProjectId(null)).toBeNull();
  });
});

describe("the project index", () => {
  it("sends the same content back to the project it already was", () => {
    const key = projectContentKey([item("1", "Pancakes")], false);
    rememberProjectId(key, "project-a");
    expect(lookupProjectId(key)).toBe("project-a");
  });

  /**
   * The whole reason this is not just a search of the shelf: once a project
   * reaches an account the device copy is swept, so the shelf forgets while
   * this does not.
   */
  it("outlives the document it points at", () => {
    const key = projectContentKey([item("1", "Pancakes")], false);
    rememberProjectId(key, "project-a");
    // Nothing on the shelf any more — the index still knows.
    expect(lookupProjectId(key)).toBe("project-a");
  });

  it("forgets a deleted project, so those recipes start something new", () => {
    const key = projectContentKey([item("1", "Pancakes")], false);
    rememberProjectId(key, "project-a");
    forgetProjectId("project-a");
    expect(lookupProjectId(key)).toBeNull();
  });
});
