import { gzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  PaprikaImportError,
  adaptPaprikaRecipe,
  readPaprikaArchive,
} from "@/lib/paprikaImport";

/* Nobody on this project has a Paprika subscription, so these tests are the
   verification: they build REAL archives — actual ZIP containers holding
   actual gzip members — and read them back through the same path a dropped
   file takes. Every variant the format is known to appear in gets a case. */

const encoder = new TextEncoder();

interface PaprikaRecord {
  uid?: string;
  name?: string;
  ingredients?: string;
  directions?: string;
  [key: string]: unknown;
}

function record(overrides: PaprikaRecord = {}): PaprikaRecord {
  return {
    uid: "11111111-2222-3333-4444-555555555555",
    name: "Borscht",
    ingredients: "2 beets\n1 onion",
    directions: "Simmer the beets.\nAdd the onion.",
    ...overrides,
  };
}

function json(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

/** The normal case: a ZIP whose entries are each gzipped JSON. */
function gzippedArchive(...records: PaprikaRecord[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  records.forEach((entry, index) => {
    files[`${entry.name ?? index}.paprikarecipe`] = gzipSync(json(entry));
  });
  return zipSync(files);
}

/** The variant: a ZIP whose entries are plain, uncompressed JSON. */
function plainArchive(...records: PaprikaRecord[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  records.forEach((entry, index) => {
    files[`${entry.name ?? index}.paprikarecipe`] = json(entry);
  });
  return zipSync(files);
}

describe("readPaprikaArchive", () => {
  it("reads a zip of gzipped entries, the format Paprika normally exports", async () => {
    const library = await readPaprikaArchive(
      gzippedArchive(record(), record({ uid: "b", name: "Kasha" })),
      "My Recipes.paprikarecipes",
    );
    expect(library.fileName).toBe("My Recipes.paprikarecipes");
    expect(library.entries.map((entry) => entry.recipe.title)).toEqual(["Borscht", "Kasha"]);
    expect(library.entries[0].queueId).toBe("paprika:11111111-2222-3333-4444-555555555555");
  });

  it("reads a zip whose entries were stored as plain JSON", async () => {
    const library = await readPaprikaArchive(plainArchive(record()), "export.paprikarecipes");
    expect(library.entries.map((entry) => entry.recipe.title)).toEqual(["Borscht"]);
  });

  it("reads a bare gzipped single recipe, which is what a one-recipe export can be", async () => {
    const library = await readPaprikaArchive(gzipSync(json(record())), "Borscht.paprikarecipe");
    expect(library.entries).toHaveLength(1);
    expect(library.entries[0].recipe.title).toBe("Borscht");
  });

  it("reads a bare JSON file", async () => {
    const library = await readPaprikaArchive(json(record()), "Borscht.json");
    expect(library.entries).toHaveLength(1);
  });

  it("reads a document holding an array of recipes", async () => {
    const library = await readPaprikaArchive(
      gzipSync(json([record(), record({ uid: "b", name: "Kasha" })])),
      "all.paprikarecipes",
    );
    expect(library.entries.map((entry) => entry.recipe.title)).toEqual(["Borscht", "Kasha"]);
  });

  it("skips the non-recipe entries an archive carries without sinking the import", async () => {
    const files: Record<string, Uint8Array> = {
      "recipe.paprikarecipe": gzipSync(json(record())),
      "categories.paprikarecipe": gzipSync(json({ uid: "c", name: "Weeknights" })),
      "junk.paprikarecipe": encoder.encode("not json at all"),
    };
    const library = await readPaprikaArchive(zipSync(files), "export.paprikarecipes");
    expect(library.entries).toHaveLength(1);
    expect(library.skipped).toBe(2);
  });

  it("ignores the metadata folder a Mac archiver adds", async () => {
    const files: Record<string, Uint8Array> = {
      "recipe.paprikarecipe": gzipSync(json(record())),
      "__MACOSX/._recipe.paprikarecipe": encoder.encode("resource fork"),
    };
    const library = await readPaprikaArchive(zipSync(files), "export.paprikarecipes");
    expect(library.entries).toHaveLength(1);
    expect(library.skipped).toBe(0);
  });

  it("refuses an entry that claims to decompress past the cap", async () => {
    // A gzip member whose ISIZE trailer claims ~4GB. The bytes are honest;
    // the claim is what a decompression bomb lies with, and it's what we check
    // before handing anything to the inflater.
    const bomb = gzipSync(json(record()));
    bomb.set([0xff, 0xff, 0xff, 0xff], bomb.length - 4);
    await expect(readPaprikaArchive(bomb, "bomb.paprikarecipes")).rejects.toMatchObject({
      code: "too_large",
    });
  });

  it("says so plainly when the file isn't an export we can read", async () => {
    await expect(
      readPaprikaArchive(encoder.encode("this is a PDF, really"), "notes.pdf"),
    ).rejects.toBeInstanceOf(PaprikaImportError);
    await expect(readPaprikaArchive(new Uint8Array(0), "empty")).rejects.toBeInstanceOf(
      PaprikaImportError,
    );
  });

  it("says something different when the file opened but held no recipes", async () => {
    const library = readPaprikaArchive(gzipSync(json({ uid: "c", name: "Weeknights" })), "x");
    await expect(library).rejects.toThrow(/didn't find any recipes/);
  });

  it("gives a recipe with no uid a stable id, so re-opening the file can't double-add it", async () => {
    const noUid = record({ uid: undefined });
    const first = await readPaprikaArchive(gzippedArchive(noUid), "a.paprikarecipes");
    const second = await readPaprikaArchive(gzippedArchive(noUid), "a.paprikarecipes");
    expect(first.entries[0].queueId).toBe(second.entries[0].queueId);
  });

  it("decodes an embedded photo to a blob, and survives one that's corrupt", async () => {
    const withPhoto = record({ photo_data: Buffer.from("jpeg-bytes").toString("base64") });
    const broken = record({ uid: "b", name: "Kasha", photo_data: "%%%not base64%%%" });
    const library = await readPaprikaArchive(
      gzippedArchive(withPhoto, broken),
      "export.paprikarecipes",
    );
    expect(library.entries[0].photo?.size).toBe("jpeg-bytes".length);
    expect(library.entries[1].photo).toBeUndefined();
    expect(library.entries[1].recipe.title).toBe("Kasha");
  });
});

describe("adaptPaprikaRecipe", () => {
  it("splits the free-text ingredient and direction blocks into lines", () => {
    const recipe = adaptPaprikaRecipe(record());
    expect(recipe?.ingredients.map((ingredient) => ingredient.raw)).toEqual(["2 beets", "1 onion"]);
    expect(recipe?.instructions).toEqual([
      { step: 1, text: "Simmer the beets.", section: undefined },
      { step: 2, text: "Add the onion.", section: undefined },
    ]);
  });

  it("turns a colon heading into the section label the card already groups by", () => {
    const recipe = adaptPaprikaRecipe(
      record({
        ingredients: "For the soup:\n2 beets\n\nFor the topping:\n1 cup sour cream",
        directions: "For the soup:\nSimmer the beets.",
      }),
    );
    expect(recipe?.ingredients.map((ingredient) => ingredient.section)).toEqual([
      "For the soup",
      "For the topping",
    ]);
    expect(recipe?.instructions[0].section).toBe("For the soup");
  });

  it("leaves a long line ending in a colon as content, not a heading", () => {
    const long = `Heat the oven and prepare every one of the following things at once:`;
    const recipe = adaptPaprikaRecipe(record({ directions: long }));
    expect(recipe?.instructions[0].text).toBe(long);
  });

  it("handles CRLF endings and blank lines", () => {
    const recipe = adaptPaprikaRecipe(record({ ingredients: "2 beets\r\n\r\n1 onion\r\n" }));
    expect(recipe?.ingredients.map((ingredient) => ingredient.raw)).toEqual(["2 beets", "1 onion"]);
  });

  it("normalizes vulgar fractions the way every other import does", () => {
    const recipe = adaptPaprikaRecipe(record({ ingredients: "½ cup dill\n1½ cups broth" }));
    expect(recipe?.ingredients.map((ingredient) => ingredient.raw)).toEqual([
      "1/2 cup dill",
      "1 1/2 cups broth",
    ]);
  });

  it("drops a hand-written step number so the card doesn't print it twice", () => {
    const recipe = adaptPaprikaRecipe(record({ directions: "1. Simmer.\n2) Serve.\nStep 3: Eat." }));
    expect(recipe?.instructions.map((instruction) => instruction.text)).toEqual([
      "Simmer.",
      "Serve.",
      "Eat.",
    ]);
  });

  it("keeps category names as tags and drops category ids", () => {
    const named = adaptPaprikaRecipe(record({ categories: ["Soups", "Weeknight"] }));
    expect(named?.tags).toEqual(["Soups", "Weeknight"]);
    const ids = adaptPaprikaRecipe(
      record({ categories: ["8B4C2E5A-1111-2222-3333-444444444444"] }),
    );
    expect(ids?.tags).toBeUndefined();
  });

  it("accepts a recipe with only ingredients, and one with only directions", () => {
    expect(adaptPaprikaRecipe(record({ directions: "" }))?.ingredients).toHaveLength(2);
    expect(adaptPaprikaRecipe(record({ ingredients: "" }))?.instructions).toHaveLength(2);
    expect(adaptPaprikaRecipe(record({ ingredients: "", directions: "" }))).toBeNull();
  });

  it("carries the source through, and falls back to the hostname for its name", () => {
    const named = adaptPaprikaRecipe(record({ source: "Grandma", source_url: "https://x.example/r" }));
    expect(named?.sourceName).toBe("Grandma");
    const unnamed = adaptPaprikaRecipe(record({ source_url: "https://www.x.example/r" }));
    expect(unnamed?.sourceName).toBe("x.example");
  });

  it("uses notes as the description only when there is no description", () => {
    expect(adaptPaprikaRecipe(record({ notes: "Freezes well." }))?.description).toBe("Freezes well.");
    expect(
      adaptPaprikaRecipe(record({ description: "A beet soup.", notes: "Freezes well." }))?.description,
    ).toBe("A beet soup.");
  });

  it("titles an untitled recipe rather than dropping it", () => {
    expect(adaptPaprikaRecipe(record({ name: undefined }))?.title).toBe("Untitled recipe");
  });
});
