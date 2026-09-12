import { describe, expect, it } from "vitest";
import { stripUndefined } from "@/lib/firebase/stripUndefined";

// This runs on the path that saves a cookbook. It had no test while it was two
// private copies, which is the wrong way round: a document that reaches
// Firestore in the wrong shape is not a crash, it is a book that lists
// correctly and opens empty.

describe("stripUndefined", () => {
  it("drops undefined keys and keeps everything else", () => {
    expect(stripUndefined({ title: "Soup", cover: undefined, pages: 12 })).toEqual({
      title: "Soup",
      pages: 12,
    });
  });

  it("keeps null, 0, empty string and false — only undefined is absent", () => {
    const kept = { a: null, b: 0, c: "", d: false };
    expect(stripUndefined(kept)).toEqual(kept);
  });

  it("reaches any depth, because one missing unit sinks the whole write", () => {
    expect(
      stripUndefined({
        recipe: { title: "Bread", ingredients: [{ raw: "flour", unit: undefined }] },
      }),
    ).toEqual({ recipe: { title: "Bread", ingredients: [{ raw: "flour" }] } });
  });

  // The case that would be a silent corruption rather than a thrown error:
  // falling into the object branch turns ["a","b"] into {0:"a",1:"b"}, which
  // Firestore accepts happily and which no longer reads back as a list.
  it("keeps an array an array", () => {
    const out = stripUndefined({ tags: ["a", "b"] });
    expect(Array.isArray(out.tags)).toBe(true);
    expect(out.tags).toEqual(["a", "b"]);
  });

  it("keeps arrays of objects as arrays, all the way down", () => {
    const out = stripUndefined({ sections: [{ items: [{ id: "1", note: undefined }] }] });
    expect(Array.isArray(out.sections)).toBe(true);
    expect(Array.isArray(out.sections[0].items)).toBe(true);
    expect(out.sections[0].items[0]).toEqual({ id: "1" });
  });

  it("passes primitives through untouched", () => {
    expect(stripUndefined("x")).toBe("x");
    expect(stripUndefined(7)).toBe(7);
    expect(stripUndefined(null)).toBeNull();
    expect(stripUndefined(undefined)).toBeUndefined();
  });
});
