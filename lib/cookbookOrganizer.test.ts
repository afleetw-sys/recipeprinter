import { describe, expect, it } from "vitest";
import {
  moveOrganizationItem,
  organizationSectionsForApply,
  suggestCookbookOrganization,
} from "@/lib/cookbookOrganizer";
import type { QueueItem, Recipe } from "@/types/recipe";

function item(id: string, title: string): QueueItem {
  const recipe: Recipe = { title, ingredients: [], instructions: [] };
  return { id, title, recipe, method: "text", source: "test", status: "ready", addedAt: 1 };
}

describe("cookbook organization draft", () => {
  const items = [
    item("cookie", "Chocolate chip cookies"),
    item("chicken", "Chicken parmesan"),
    item("mystery", "Grandma's favorite"),
  ];

  it("creates a deterministic temporary proposal", () => {
    const first = suggestCookbookOrganization(items);
    expect(suggestCookbookOrganization(items)).toEqual(first);
    expect(first.sections.map((section) => section.title)).toEqual([
      "Main Dishes",
      "Desserts",
      "Uncategorized",
    ]);
  });

  it("moves within the draft without mutating the original", () => {
    const original = suggestCookbookOrganization(items);
    const desserts = original.sections.find((section) => section.title === "Desserts")!;
    const moved = moveOrganizationItem(original, "mystery", desserts.id);
    expect(original.sections.find((section) => section.title === "Uncategorized")?.itemIds).toEqual(["mystery"]);
    expect(moved.sections.find((section) => section.title === "Desserts")?.itemIds).toContain("mystery");
  });

  it("applies without duplicate or lost recipes", () => {
    const draft = suggestCookbookOrganization(items);
    draft.sections[0].itemIds.push("cookie", "missing");
    const applied = organizationSectionsForApply(draft, items.map((entry) => entry.id));
    expect(applied.flatMap((section) => section.itemIds).sort()).toEqual(["chicken", "cookie", "mystery"]);
  });

  it("cancel is mutation-free because the proposal is detached", () => {
    const persisted = [{ id: "current", title: "Current", itemIds: ["cookie", "chicken", "mystery"] }];
    const snapshot = structuredClone(persisted);
    moveOrganizationItem(suggestCookbookOrganization(items), "mystery", "suggested-desserts");
    expect(persisted).toEqual(snapshot);
  });

  it("supports immediate undo by restoring the saved section snapshot", () => {
    const before = [{ id: "current", title: "Current", itemIds: ["cookie", "chicken", "mystery"] }];
    const applied = organizationSectionsForApply(suggestCookbookOrganization(items), items.map((entry) => entry.id));
    expect(applied).not.toEqual(before);
    expect(structuredClone(before)).toEqual(before);
  });
});
