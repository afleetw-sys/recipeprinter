import { describe, expect, it } from "vitest";
import type { PrintProject } from "@/types/recipe";
import { newerLocalCopy } from "@/lib/unsavedLocalCopy";

function book(overrides: Partial<PrintProject> & { servings?: string } = {}): PrintProject {
  const { servings = "4", ...rest } = overrides;
  return {
    id: "book-1",
    ownerUid: "uid-1",
    revision: 3,
    title: "Our Favorite Recipes",
    createdAt: 1,
    updatedAt: 2,
    settings: { template: "classic", cardSize: "letter" },
    sections: [
      {
        id: "s1",
        title: "Mains",
        items: [
          {
            id: "r1",
            status: "ready",
            recipe: {
              title: "Lemon Herb Chicken",
              servings,
              ingredients: [{ raw: "1 lemon", amount: 1, name: "lemon" }],
              instructions: [{ step: 1, text: "Roast." }],
            },
          },
        ],
      },
    ],
    ...rest,
  } as unknown as PrintProject;
}

describe("newerLocalCopy", () => {
  it("opens the device copy when it is the account's version plus an edit", () => {
    const device = book({ servings: "6", ownerUid: "", title: "Lemon Herb Chicken" });
    expect(newerLocalCopy(book(), [device])).toBe(device);
  });

  it("counts a settings change (a theme) as an edit", () => {
    const device = book({ settings: { template: "garden", cardSize: "letter" } as PrintProject["settings"] });
    expect(newerLocalCopy(book(), [device])).toBe(device);
  });

  it("keeps the account copy when someone has saved since the device copy's version", () => {
    expect(newerLocalCopy(book({ revision: 4 }), [book({ servings: "6", revision: 3 })])).toBeNull();
  });

  it("never trusts a device copy with no recorded version", () => {
    expect(newerLocalCopy(book(), [book({ servings: "6", revision: undefined })])).toBeNull();
    expect(newerLocalCopy(book({ revision: 0 }), [book({ servings: "6", revision: 0 })])).toBeNull();
  });

  it("ignores a copy of a different book", () => {
    expect(newerLocalCopy(book(), [book({ id: "book-2", servings: "6" })])).toBeNull();
  });

  it("does not re-save an unedited book because of how it was stored", () => {
    // Firestore's key order, a save's bookkeeping, the shelf's derived title,
    // and ingredients the save slimmed: all the same book.
    const account = book({ saveId: "s-9", updatedAt: 99, title: "Our Favorite Recipes" } as Partial<PrintProject>);
    account.sections[0].items[0].recipe!.ingredients = [{ raw: "1 lemon" }];
    const device = JSON.parse(JSON.stringify(book({ ownerUid: "", title: "Lemon Herb Chicken + 0 more" })));
    const reordered = Object.fromEntries(Object.entries(device).reverse()) as unknown as PrintProject;
    expect(newerLocalCopy(account, [reordered])).toBeNull();
  });

  it("takes the first device copy that qualifies, so the freshest is listed first", () => {
    const working = book({ servings: "8" });
    const shelf = book({ servings: "6" });
    expect(newerLocalCopy(book(), [null, working, shelf])).toBe(working);
    expect(newerLocalCopy(book(), [book({ revision: 1, servings: "8" }), shelf])).toBe(shelf);
  });
});
