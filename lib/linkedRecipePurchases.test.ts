import { describe, expect, it } from "vitest";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import type { QueueItem, Recipe } from "@/types/recipe";
import { computeProLocks } from "@/lib/recipePrinterPurchases";
import { planCardExport } from "@/lib/server/cardExport";
import { bookRoomLeft, waitingRecipesMayArrive } from "@/lib/cookbookFreeSize";
import { keepsItself } from "@/lib/printAutosave";

/* Moving recipes between a cookbook and recipe cards must never move a
   purchase with them. What a job may print is decided by the JOB (its kind,
   its recipe count, its card size), never by where its recipes came from, so
   a card job made from a book is gated exactly like any other card job, on the
   page and on the server. */

function customer(active: string[]): CustomerInfo {
  const entitlements = Object.fromEntries(active.map((id) => [id, { identifier: id, isActive: true }]));
  return { entitlements: { active: entitlements, all: entitlements } } as unknown as CustomerInfo;
}
const free = customer([]);
const pro = customer(["pro"]);

const linked = (id: string): QueueItem => ({
  id,
  method: "url",
  source: "x",
  status: "ready",
  title: id,
  recipe: { title: id, ingredients: [], instructions: [] } as Recipe,
  link: { id: `book_${id}`, rev: 1, base: {} },
  addedAt: 1,
});

/** A card job holding recipes printed from a book, as it reaches /api/card-export. */
function cardExport(count: number, cardSize: "letter" | "card-6x4" = "letter") {
  return {
    output: "pdf",
    project: {
      kind: "printProject",
      settings: { cardSize, template: "document" },
      sections: [{ id: "s", title: "", items: Array.from({ length: count }, (_, index) => linked(`r${index}`)) }],
    },
  };
}

const cardLocks = (recipeCount: number, customerInfo: CustomerInfo, cardSize: "letter" | "card-6x4" = "letter") =>
  computeProLocks({ customerInfo, cookbookMode: false, template: "document", selectedPremiumTemplate: null, cardSize, recipeCount });

describe("cards printed from a cookbook are gated like any other cards", () => {
  it("one full-page recipe on a free template prints free", () => {
    expect(cardLocks(1, free).proLocked).toBe(false);
    expect(planCardExport(cardExport(1), []).ok).toBe(true);
  });

  it("several recipes preview free and print with Pro, on the page and on the server", () => {
    // Preview first: the job holds them all, and Print is what asks for Pro.
    // The same lock marks a browser print (Cmd+P) "PREVIEW" (printWatermarked).
    expect(cardLocks(3, free)).toMatchObject({ multiRecipeLocked: true, proLocked: true });
    expect(planCardExport(cardExport(3), [])).toEqual({ ok: false, kind: "locked", reasons: ["multi_recipe"] });
    expect(cardLocks(3, pro).proLocked).toBe(false);
    expect(planCardExport(cardExport(3), ["pro"]).ok).toBe(true);
  });

  it("4x6 cards need Pro", () => {
    expect(cardLocks(1, free, "card-6x4").cardSizeLocked).toBe(true);
    expect(planCardExport(cardExport(1, "card-6x4"), [])).toEqual({ ok: false, kind: "locked", reasons: ["card_size"] });
  });

  it("buying the cookbook does not unlock Pro printing: a card job is never in cookbook mode", () => {
    // The cookbook unlock is per book and only ever lifts cookbook gates; the
    // card job is its own project, so the waivers cookbook mode gets do not
    // follow its recipes. And a card download cannot claim to be a cookbook.
    expect(cardLocks(3, free).proLocked).toBe(true);
    const disguised = { ...cardExport(3), project: { ...cardExport(3).project, settings: { cookbookMode: true } } };
    expect(planCardExport(disguised, []).ok).toBe(false);
  });
});

describe("recipes brought into a cookbook count toward its free size", () => {
  it("an unbought book takes ten, however they arrived; Pro does not lift it; buying the book does", () => {
    // bookRoomLeft knows nothing of Pro or of where recipes came from: only the
    // book's own purchase and how many recipes it holds.
    expect(bookRoomLeft({ cookbookMode: true, locked: true, recipeCount: 10, live: true })).toBe(0);
    expect(bookRoomLeft({ cookbookMode: true, locked: true, recipeCount: 7, live: true })).toBe(3);
    expect(bookRoomLeft({ cookbookMode: true, locked: false, recipeCount: 300, live: true })).toBeNull();
  });
});

describe("which jobs save themselves", () => {
  it.each([
    [{ cookbookMode: false, recipeCount: 1 }, false],
    [{ cookbookMode: false, recipeCount: 2 }, true],
    [{ cookbookMode: true, recipeCount: 0 }, true],
    [{ cookbookMode: false, recipeCount: 1, cardsFromCookbook: true }, true],
    [{ cookbookMode: false, recipeCount: 0, cardsFromCookbook: true }, false],
  ])("%o keeps itself: %s", (job, expected) => {
    expect(keepsItself(job)).toBe(expected);
  });
});

describe("a cookbook made from recipe cards", () => {
  const waiting = { waitingIn: "cards-1", signedIn: true, cookbookMode: true };

  it("takes the recipes that didn't fit only once this book is bought", () => {
    expect(waitingRecipesMayArrive({ ...waiting, bookBought: false })).toBe(false);
    expect(waitingRecipesMayArrive({ ...waiting, bookBought: true })).toBe(true);
  });

  it("never while signed out, outside the book, or with nothing waiting", () => {
    expect(waitingRecipesMayArrive({ ...waiting, signedIn: false, bookBought: true })).toBe(false);
    expect(waitingRecipesMayArrive({ ...waiting, cookbookMode: false, bookBought: true })).toBe(false);
    expect(waitingRecipesMayArrive({ ...waiting, waitingIn: undefined, bookBought: true })).toBe(false);
  });
});
