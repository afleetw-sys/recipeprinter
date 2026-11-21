import { describe, expect, it } from "vitest";
import type { Recipe } from "@/types/recipe";
import {
  applyRemoteFields,
  changedFields,
  fieldPrints,
  mergeLinked,
  recipeToShare,
} from "@/lib/linkedRecipes";

/* The rule that decides, field by field, whose edit a linked recipe keeps.
   Everything about sync rests on it: get it wrong and one project's edit
   silently replaces another's. */

const base: Recipe = {
  title: "Grandma's pie",
  description: "From the farm.",
  ingredients: [{ name: "flour" } as Recipe["ingredients"][number]],
  instructions: [{ text: "Bake." } as Recipe["instructions"][number]],
  servings: 8,
};

function edit(recipe: Recipe, changes: Partial<Recipe>): Recipe {
  return { ...recipe, ...changes };
}

describe("mergeLinked", () => {
  const prints = fieldPrints(base);

  it.each([
    {
      name: "changed only here: written out",
      local: edit(base, { title: "Pie" }),
      remote: base,
      expected: edit(base, { title: "Pie" }),
      pushes: true,
      fromRemote: {},
      conflicts: [],
    },
    {
      name: "changed only elsewhere: taken in",
      local: base,
      remote: edit(base, { servings: 6 }),
      expected: edit(base, { servings: 6 }),
      pushes: false,
      fromRemote: { servings: 6 },
      conflicts: [],
    },
    {
      name: "different fields on each side: both kept",
      local: edit(base, { title: "Pie" }),
      remote: edit(base, { servings: 6 }),
      expected: edit(base, { title: "Pie", servings: 6 }),
      pushes: true,
      fromRemote: { servings: 6 },
      conflicts: [],
    },
    {
      name: "same field, same change: nothing to do",
      local: edit(base, { title: "Pie" }),
      remote: edit(base, { title: "Pie" }),
      expected: edit(base, { title: "Pie" }),
      pushes: false,
      fromRemote: {},
      conflicts: [],
    },
    {
      name: "same field, different changes: the copy on screen wins, the other is returned",
      local: edit(base, { title: "Mine" }),
      remote: edit(base, { title: "Theirs" }),
      expected: edit(base, { title: "Mine" }),
      pushes: true,
      fromRemote: {},
      conflicts: [{ field: "title", theirs: "Theirs" }],
    },
    {
      name: "a field removed elsewhere is removed here",
      local: base,
      remote: (({ description: _drop, ...rest }) => rest)(base) as Recipe,
      expected: (({ description: _drop, ...rest }) => rest)(base) as Recipe,
      pushes: false,
      fromRemote: { description: undefined },
      conflicts: [],
    },
    {
      name: "a field added here is written out",
      local: edit(base, { note: "Use cold butter." }),
      remote: base,
      expected: edit(base, { note: "Use cold butter." }),
      pushes: true,
      fromRemote: {},
      conflicts: [],
    },
    {
      name: "a list edited on both sides is one field: a conflict, never a silent loss",
      local: edit(base, { ingredients: [{ name: "rye flour" } as Recipe["ingredients"][number]] }),
      remote: edit(base, { ingredients: [{ name: "spelt flour" } as Recipe["ingredients"][number]] }),
      expected: edit(base, { ingredients: [{ name: "rye flour" } as Recipe["ingredients"][number]] }),
      pushes: true,
      fromRemote: {},
      conflicts: [{ field: "ingredients", theirs: [{ name: "spelt flour" }] }],
    },
  ])("$name", ({ local, remote, expected, pushes, fromRemote, conflicts }) => {
    const merge = mergeLinked(local, prints, remote);
    expect(merge.recipe).toEqual(expected);
    expect(merge.pushes).toBe(pushes);
    expect(merge.fromRemote).toEqual(fromRemote);
    expect(merge.conflicts).toEqual(conflicts);
    // Applying what came in to the copy gives the merged recipe: a pull can
    // never leave the copy different from what was agreed.
    expect(applyRemoteFields(local, merge.fromRemote)).toEqual(expected);
  });

  it("an undefined field and an absent one are the same version", () => {
    expect(changedFields({ ...base, note: undefined }, prints)).toEqual([]);
  });

  it("key order is not an edit", () => {
    const reordered = { servings: 8, instructions: base.instructions, ingredients: base.ingredients, description: base.description, title: base.title } as Recipe;
    expect(changedFields(reordered, prints)).toEqual([]);
  });
});

describe("recipeToShare", () => {
  const website = edit(base, { image: "https://site.example/pie.jpg" });

  it("moves a book's own photo choice into the recipe, so every format shows it", () => {
    expect(recipeToShare(website, { photoUrl: "https://storage.example/mine.jpg" }, true)).toEqual(
      edit(website, { image: "https://storage.example/mine.jpg", imageChosen: true }),
    );
  });

  it("a photo the cook removed in the book is a choice too", () => {
    expect(recipeToShare(website, { photoUrl: "" }, true)).toEqual(edit(website, { image: "", imageChosen: true }));
  });

  it.each([
    ["no choice made in the book", website, {}, true],
    ["an older book, which shows the recipe's own image", website, { photoUrl: "x" }, false],
    ["a recipe whose photo is already a choice", edit(website, { imageChosen: true }), { photoUrl: "x" }, true],
  ] as const)("leaves the recipe alone for %s", (_name, recipe, placement, ownPhotosOnly) => {
    expect(recipeToShare(recipe, placement, ownPhotosOnly)).toBe(recipe);
  });
});
