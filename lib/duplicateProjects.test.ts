import { describe, expect, it } from "vitest";
import { planDuplicateCleanup, projectContainment } from "@/lib/duplicateProjects";
import type { PrintProject } from "@/types/recipe";

function book(
  id: string,
  itemIds: string[],
  updatedAt: number,
  kind: PrintProject["kind"] = "cookbook",
): PrintProject {
  return {
    id,
    kind,
    revision: 0,
    ownerUid: "user-1",
    title: "Family Favorites",
    sections: [{ id: `${id}-s1`, title: "Mains", items: itemIds.map((itemId) => ({ id: itemId })) }],
    settings: {},
    createdAt: 1,
    updatedAt,
  } as unknown as PrintProject;
}

describe("planning the duplicate cleanup", () => {
  it("removes forks that are contained in the copy being kept", () => {
    const { keep, remove } = planDuplicateCleanup([
      book("copy-3", ["r1", "r2"], 300),
      book("copy-2", ["r2", "r1"], 200),
      book("copy-1", ["r1", "r2"], 100),
    ]);

    expect(keep.map((project) => project.id)).toEqual(["copy-3"]);
    expect(remove.map((project) => project.id)).toEqual(["copy-2", "copy-1"]);
  });

  it("removes the older copies of a book that grew between forks", () => {
    // The real shape of the bug: a book forked over months, so the oldest copy
    // holds 3 recipes and the newest holds 8.
    const { keep, remove } = planDuplicateCleanup([
      book("copy-4", ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"], 400),
      book("copy-3", ["r1", "r2", "r3", "r4", "r5"], 300),
      book("copy-2", ["r1", "r2", "r3", "r4"], 200),
      book("copy-1", ["r1", "r2", "r3"], 100),
    ]);

    expect(keep.map((project) => project.id)).toEqual(["copy-4"]);
    expect(remove).toHaveLength(3);
  });

  it("keeps a copy holding recipes the newer one has lost", () => {
    // Deleting without asking means erring toward keeping: this copy has three
    // recipes that exist nowhere else.
    const { keep, remove } = planDuplicateCleanup([
      book("current", ["r1", "r2"], 200),
      book("older", ["r1", "r2", "r7", "r8", "r9"], 100),
    ]);

    expect(keep.map((project) => project.id)).toEqual(["current", "older"]);
    expect(remove).toHaveLength(0);
  });

  it("keeps books that merely share a recipe or two", () => {
    const { keep, remove } = planDuplicateCleanup([
      book("weeknights", ["r1", "r2", "r3", "r4"], 300),
      book("holiday", ["r1", "r9", "r8", "r7"], 200),
    ]);

    expect(keep.map((project) => project.id)).toEqual(["weeknights", "holiday"]);
    expect(remove).toHaveLength(0);
  });

  it("never removes a pinned copy", () => {
    const { keep, remove } = planDuplicateCleanup(
      [book("copy-3", ["r1"], 300), book("copy-2", ["r1"], 200), book("copy-1", ["r1"], 100)],
      { pin: (project) => project.id === "copy-1" },
    );

    expect(keep.map((project) => project.id)).toEqual(["copy-3", "copy-1"]);
    expect(remove.map((project) => project.id)).toEqual(["copy-2"]);
  });

  it("does not pair a cookbook with a print project holding the same recipes", () => {
    const { remove } = planDuplicateCleanup([
      book("book-a", ["r1"], 300),
      book("cards-a", ["r1"], 200, "printProject"),
    ]);

    expect(remove).toHaveLength(0);
  });

  it("treats an empty project as unidentifiable, so empties are never removed", () => {
    expect(projectContainment(book("empty-1", [], 100), book("empty-2", [], 90))).toBe(0);
    const { remove } = planDuplicateCleanup([book("empty-1", [], 200), book("empty-2", [], 100)]);
    expect(remove).toHaveLength(0);
  });

  it("tolerates a few recipes dropped from the book after a fork", () => {
    const { remove } = planDuplicateCleanup([
      book("current", ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"], 200),
      book("older", ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"], 100),
    ]);

    expect(remove.map((project) => project.id)).toEqual(["older"]);
  });
});
