import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem, Recipe } from "@/types/recipe";
import { applyRemoteFields, recipeToShare } from "@/lib/linkedRecipes";
import type { LinkedRecipeRecord, LinkedUpdate } from "@/lib/linkedRecipeStore";

/* Sync between projects, end to end through the record store. Firestore is an
   in-memory map and a transaction is a function call: what matters here is
   which recipe each copy ends up with, which documents get written, and that
   nothing is lost or duplicated, not what Firestore does with a write. */

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const writes = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));
vi.mock("firebase/firestore", () => {
  const snapOf = (path: string) => ({
    id: path.split("/").pop(),
    exists: () => store.has(path),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined),
  });
  return {
    doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
    collection: (_db: unknown, ...segments: string[]) => segments.join("/"),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (path: string, filter: { field: string; value: unknown }) => ({ path, filter }),
    getDocFromServer: async (path: string) => snapOf(path),
    getDocsFromServer: async (target: string | { path: string; filter: { field: string; value: string } }) => {
      const path = typeof target === "string" ? target : target.path;
      const docs = Array.from(store.keys())
        .filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
        .filter((key) =>
          typeof target === "string"
            ? true
            : ((store.get(key)![target.filter.field] as string[]) ?? []).includes(target.filter.value),
        )
        .map(snapOf);
      return { docs };
    },
    runTransaction: async (_db: unknown, body: (transaction: unknown) => Promise<unknown>) =>
      body({
        get: async (path: string) => snapOf(path),
        set: (path: string, data: Record<string, unknown>) => {
          writes.push(path);
          store.set(path, structuredClone(data));
        },
        delete: (path: string) => {
          writes.push(path);
          store.delete(path);
        },
      }),
  };
});

import { leaveLinkedRecipes, linkedRecipeId, reconcileLinkedRecipes, shareRecipe } from "@/lib/linkedRecipeStore";

const UID = "cook";
const ROOT = `products/recipePrinter/users/${UID}/linkedRecipes`;

const pie: Recipe = {
  title: "Grandma's pie",
  ingredients: [{ name: "flour" } as Recipe["ingredients"][number]],
  instructions: [{ text: "Bake." } as Recipe["instructions"][number]],
  image: "https://site.example/pie.jpg",
};

function item(id: string, recipe: Recipe, link?: QueueItem["link"]): QueueItem {
  return { id, method: "url", source: "site.example", status: "ready", title: recipe.title, recipe, link, addedAt: 1 };
}

/** What a project does with a reconcile's answer: the same rule /print applies. */
function apply(items: QueueItem[], updates: LinkedUpdate[]): QueueItem[] {
  return items.map((current) => {
    const update = updates.find((candidate) => candidate.itemId === current.id);
    if (!update || !current.recipe) return current;
    const recipe = applyRemoteFields(current.recipe, update.fromRemote);
    const next: QueueItem = { ...current, recipe, title: recipe.title };
    if (update.link) next.link = update.link;
    else delete next.link;
    return next;
  });
}

function record(id: string): LinkedRecipeRecord {
  return store.get(`${ROOT}/${id}`) as unknown as LinkedRecipeRecord;
}

/** A saved book with the pie in it, printed as a card: the card job's copy. */
async function printFromBook(bookId = "book", itemId = "b1", recipe: Recipe = pie) {
  const shared = await shareRecipe(UID, {
    projectId: bookId,
    member: true,
    itemId,
    recipe,
    shared: recipe,
  });
  return item("c1", shared.recipe, shared.link);
}

beforeEach(() => {
  store.clear();
  writes.length = 0;
});

describe("sharing a recipe", () => {
  it("makes one record per recipe, however many times it is shared", async () => {
    const first = await printFromBook();
    const second = await printFromBook();
    expect(first.link!.id).toBe(second.link!.id);
    expect(Array.from(store.keys())).toEqual([`${ROOT}/${linkedRecipeId("book", "b1")}`]);
    // A copy taken from a copy joins the same record rather than starting one.
    const fromCopy = await shareRecipe(UID, {
      projectId: "cards",
      member: false,
      itemId: first.id,
      recipe: first.recipe!,
      shared: first.recipe!,
      link: first.link,
    });
    expect(fromCopy.link.id).toBe(first.link!.id);
    expect(store.size).toBe(1);
  });
});

describe("edits stay in step", () => {
  it("an edit in an unsaved card job reaches the book, and only the recipe changes", async () => {
    const card = await printFromBook();
    const edited = { ...card, recipe: { ...card.recipe!, title: "Pie" } };
    const fromCards = await reconcileLinkedRecipes(UID, null, [edited]);
    expect(fromCards.pushed).toEqual(["c1"]);
    // An unsaved card job is not a member: printing never adds a project.
    expect(record(card.link!.id).projectIds).toEqual(["book"]);

    // The book opens later. Its copy has no link yet: it is adopted.
    const other = item("b2", { ...pie, title: "Bread" });
    const book = [item("b1", pie), other];
    writes.length = 0;
    const opened = await reconcileLinkedRecipes(UID, "book", book);
    const after = apply(book, opened.updates);
    expect(after[0]!.recipe!.title).toBe("Pie");
    expect(after[0]!.link!.id).toBe(card.link!.id);
    // The book's other recipe, and every project document, are untouched.
    expect(after[1]).toBe(other);
    expect(writes.every((path) => path.startsWith(ROOT))).toBe(true);
    expect(opened.conflicts).toEqual([]);
  });

  it("edits to different fields in two places both survive", async () => {
    const card = await printFromBook();
    const bookCopy = apply([item("b1", pie)], (await reconcileLinkedRecipes(UID, "book", [item("b1", pie)])).updates)[0]!;
    await reconcileLinkedRecipes(UID, null, [{ ...card, recipe: { ...card.recipe!, title: "Pie" } }]);
    const bookEdited = { ...bookCopy, recipe: { ...bookCopy.recipe!, servings: 6 } };
    const result = await reconcileLinkedRecipes(UID, "book", [bookEdited]);
    expect(result.conflicts).toEqual([]);
    expect(apply([bookEdited], result.updates)[0]!.recipe).toMatchObject({ title: "Pie", servings: 6 });
    expect(record(card.link!.id).recipe).toMatchObject({ title: "Pie", servings: 6 });
  });

  it("the same field edited in two places keeps the one on screen and hands back the other", async () => {
    const card = await printFromBook();
    const bookCopy = apply([item("b1", pie)], (await reconcileLinkedRecipes(UID, "book", [item("b1", pie)])).updates)[0]!;
    const cardEdited = { ...card, recipe: { ...card.recipe!, title: "From the cards" } };
    const cardSynced = apply([cardEdited], (await reconcileLinkedRecipes(UID, null, [cardEdited])).updates)[0]!;
    const bookEdited = { ...bookCopy, recipe: { ...bookCopy.recipe!, title: "From the book" } };
    const result = await reconcileLinkedRecipes(UID, "book", [bookEdited]);
    expect(result.conflicts).toEqual([
      { itemId: "b1", conflicts: [{ field: "title", theirs: "From the cards" }] },
    ]);
    expect(record(card.link!.id).recipe.title).toBe("From the book");
    // The card job, pulling next, ends up with the same recipe: nobody is left
    // holding a version the other no longer has.
    const pulled = apply([cardSynced], (await reconcileLinkedRecipes(UID, null, [cardSynced])).updates)[0]!;
    expect(pulled.recipe!.title).toBe("From the book");
  });

  it("a copy with no edits of its own just takes the newer version", async () => {
    const card = await printFromBook();
    await reconcileLinkedRecipes(UID, "book", [item("b1", { ...pie, title: "Pie" })]);
    const result = await reconcileLinkedRecipes(UID, null, [card]);
    expect(result.conflicts).toEqual([]);
    expect(apply([card], result.updates)[0]!.recipe!.title).toBe("Pie");
  });
});

describe("removing a recipe", () => {
  it("from one project leaves every other copy alone", async () => {
    const card = await printFromBook();
    // A second cookbook uses the same recipe.
    const second = item("x1", card.recipe!, card.link);
    await reconcileLinkedRecipes(UID, "second", [second]);
    expect(record(card.link!.id).projectIds.sort()).toEqual(["book", "second"]);

    // The first book drops it.
    await reconcileLinkedRecipes(UID, "book", [item("b9", { ...pie, title: "Something else" })]);
    expect(record(card.link!.id).projectIds).toEqual(["second"]);
    // The second book and the card job still hold it, still linked, unchanged.
    const stillThere = await reconcileLinkedRecipes(UID, "second", [second]);
    expect(stillThere.updates.filter((update) => update.link === null)).toEqual([]);
    const cardResult = await reconcileLinkedRecipes(UID, null, [card]);
    expect(cardResult.updates.filter((update) => update.link === null)).toEqual([]);
  });

  it("from the last project deletes the record; a card job holding it keeps its recipe", async () => {
    const card = await printFromBook();
    await reconcileLinkedRecipes(UID, "book", []);
    expect(store.size).toBe(0);
    const result = await reconcileLinkedRecipes(UID, null, [card]);
    expect(result.updates).toEqual([{ itemId: "c1", fromRemote: {}, link: null }]);
    expect(apply([card], result.updates)[0]!.recipe).toEqual(card.recipe);
  });

  it("deleting a project is the same as removing all of its recipes", async () => {
    const card = await printFromBook();
    await reconcileLinkedRecipes(UID, "second", [item("x1", card.recipe!, card.link)]);
    await leaveLinkedRecipes(UID, "book");
    expect(record(card.link!.id).projectIds).toEqual(["second"]);
  });
});

describe("photos", () => {
  it("a photo chosen in a book of the cook's own photos reaches the cards, and the book takes it back without a conflict", async () => {
    const placement = { photoUrl: "https://storage.example/mine.jpg" };
    const shared = recipeToShare(pie, placement, true);
    const copy = await shareRecipe(UID, { projectId: "book", member: true, itemId: "b1", recipe: pie, shared });
    expect(copy.recipe).toMatchObject({ image: "https://storage.example/mine.jpg", imageChosen: true });

    const result = await reconcileLinkedRecipes(UID, "book", [item("b1", pie)]);
    expect(result.conflicts).toEqual([]);
    expect(result.pushed).toEqual([]);
    expect(apply([item("b1", pie)], result.updates)[0]!.recipe).toMatchObject({
      image: "https://storage.example/mine.jpg",
      imageChosen: true,
    });
  });

  it("a new photo picked on a card reaches the book", async () => {
    const card = await printFromBook();
    const picked = { ...card, recipe: { ...card.recipe!, image: "https://storage.example/new.jpg", imageChosen: true } };
    await reconcileLinkedRecipes(UID, null, [picked]);
    const opened = await reconcileLinkedRecipes(UID, "book", [item("b1", pie)]);
    expect(apply([item("b1", pie)], opened.updates)[0]!.recipe).toMatchObject({
      image: "https://storage.example/new.jpg",
      imageChosen: true,
    });
  });
});
