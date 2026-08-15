import { describe, expect, it, vi } from "vitest";
import { groupDuplicateProjects, planDuplicateCleanup, projectContainment } from "@/lib/duplicateProjects";
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

const ids = (projects: PrintProject[]) => projects.map((project) => project.id);

describe("planning the duplicate cleanup", () => {
  it("removes forks that are contained in the copy being kept", async () => {
    const { keep, remove } = await planDuplicateCleanup("user-1", [
      book("copy-3", ["r1", "r2"], 300),
      book("copy-2", ["r2", "r1"], 200),
      book("copy-1", ["r1", "r2"], 100),
    ]);

    expect(ids(keep)).toEqual(["copy-3"]);
    expect(ids(remove)).toEqual(["copy-2", "copy-1"]);
  });

  it("removes the older copies of a book that grew between forks", async () => {
    // The real shape of the bug: a book forked over months, so the oldest copy
    // holds 3 recipes and the newest holds 8.
    const { keep, remove } = await planDuplicateCleanup("user-1", [
      book("copy-4", ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"], 400),
      book("copy-3", ["r1", "r2", "r3", "r4", "r5"], 300),
      book("copy-2", ["r1", "r2", "r3", "r4"], 200),
      book("copy-1", ["r1", "r2", "r3"], 100),
    ]);

    expect(ids(keep)).toEqual(["copy-4"]);
    expect(remove).toHaveLength(3);
  });

  it("keeps a copy holding recipes the newer one has lost", async () => {
    // Deleting without asking means erring toward keeping: this copy has three
    // recipes that exist nowhere else.
    const { keep, remove } = await planDuplicateCleanup("user-1", [
      book("current", ["r1", "r2"], 200),
      book("older", ["r1", "r2", "r7", "r8", "r9"], 100),
    ]);

    expect(ids(keep)).toEqual(["current", "older"]);
    expect(remove).toHaveLength(0);
  });

  it("keeps books that merely share a recipe or two", async () => {
    const { keep, remove } = await planDuplicateCleanup("user-1", [
      book("weeknights", ["r1", "r2", "r3", "r4"], 300),
      book("holiday", ["r1", "r9", "r8", "r7"], 200),
    ]);

    expect(ids(keep)).toEqual(["weeknights", "holiday"]);
    expect(remove).toHaveLength(0);
  });

  it("does not pair a cookbook with a print project holding the same recipes", async () => {
    const { remove } = await planDuplicateCleanup("user-1", [
      book("book-a", ["r1"], 300),
      book("cards-a", ["r1"], 200, "printProject"),
    ]);

    expect(remove).toHaveLength(0);
  });

  it("treats an empty project as unidentifiable, so empties are never removed", async () => {
    expect(projectContainment(book("empty-1", [], 100), book("empty-2", [], 90))).toBe(0);
    const { remove } = await planDuplicateCleanup("user-1", [
      book("empty-1", [], 200),
      book("empty-2", [], 100),
    ]);
    expect(remove).toHaveLength(0);
  });

  it("tolerates a few recipes dropped from the book after a fork", async () => {
    const { remove } = await planDuplicateCleanup("user-1", [
      book("current", ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"], 200),
      book("older", ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"], 100),
    ]);

    expect(ids(remove)).toEqual(["older"]);
  });
});

describe("cleaning up a book whose purchase followed the forks", () => {
  // The case that made the first sweep a no-op: one purchase, re-persisted at
  // every newly forked id, so nearly every copy reads as purchased.
  const forks = [
    book("copy-3", ["r1", "r2"], 300),
    book("copy-2", ["r1", "r2"], 200),
    book("copy-1", ["r1", "r2"], 100),
  ];

  it("removes purchased duplicates when the keeper is itself unlocked", async () => {
    const grantUnlock = vi.fn();
    const { keep, remove } = await planDuplicateCleanup("user-1", forks, {
      isPurchased: () => true,
      grantUnlock,
    });

    expect(ids(keep)).toEqual(["copy-3"]);
    expect(ids(remove)).toEqual(["copy-2", "copy-1"]);
    expect(grantUnlock).not.toHaveBeenCalled();
  });

  it("moves the unlock onto the keeper before deleting the copy that held it", async () => {
    const grantUnlock = vi.fn().mockResolvedValue(true);
    const { keep, remove, granted } = await planDuplicateCleanup("user-1", forks, {
      isPurchased: (project) => project.id !== "copy-3",
      grantUnlock,
    });

    expect(grantUnlock).toHaveBeenCalledWith("user-1", "copy-3");
    expect(granted).toEqual(["copy-3"]);
    expect(ids(keep)).toEqual(["copy-3"]);
    expect(ids(remove)).toEqual(["copy-2", "copy-1"]);
  });

  it("leaves the purchased copy standing when the unlock cannot be moved", async () => {
    const grantUnlock = vi.fn().mockResolvedValue(false);
    const { keep, remove, granted } = await planDuplicateCleanup("user-1", forks, {
      isPurchased: (project) => project.id !== "copy-3",
      grantUnlock,
    });

    expect(granted).toEqual([]);
    expect(ids(keep)).toEqual(["copy-3", "copy-2"]);
    expect(ids(remove)).toEqual(["copy-1"]);
  });

  it("survives a grantUnlock that throws", async () => {
    const grantUnlock = vi.fn().mockRejectedValue(new Error("permission-denied"));
    const { keep, remove } = await planDuplicateCleanup("user-1", forks, {
      isPurchased: (project) => project.id !== "copy-3",
      grantUnlock,
    });

    expect(ids(keep)).toEqual(["copy-3", "copy-2"]);
    expect(ids(remove)).toEqual(["copy-1"]);
  });
});

describe("grouping projects into books", () => {
  it("puts each lineage under its most recent copy", () => {
    const groups = groupDuplicateProjects([
      book("book-a-2", ["r1", "r2"], 400),
      book("book-b", ["r8", "r9"], 300),
      book("book-a-1", ["r1", "r2"], 200),
    ]);

    expect(groups.map((group) => group.keeper.id)).toEqual(["book-a-2", "book-b"]);
    expect(ids(groups[0].duplicates)).toEqual(["book-a-1"]);
    expect(groups[1].duplicates).toHaveLength(0);
  });
});
