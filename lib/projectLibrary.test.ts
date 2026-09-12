import { describe, expect, it } from "vitest";
import { libraryProjects } from "@/lib/projectLibrary";
import type { PrintProjectSummary } from "@/types/recipe";

/* What is in a cook's library, as both surfaces that show it must agree.
 *
 * `/projects` and the account dropdown each composed their own answer out of
 * the same helpers, and disagreed in the direction that costs money: signed in,
 * the menu listed only the account's projects and never merged the device
 * shelf. A cookbook bought while signed out keeps its unlock locally against
 * the local project id until the webhook lands or the book is adopted — so it
 * was on /projects and missing from the menu. Signing in made a book you had
 * paid for disappear from the control you actually reach for.
 *
 * They call one function now, and this is where its rules are pinned. */

function summary(over: Partial<PrintProjectSummary> & { id: string }): PrintProjectSummary {
  return {
    kind: "cookbook",
    title: over.id,
    // Inside the fork era, so `groupDuplicateProjects` will actually consider
    // these for grouping rather than passing them straight through.
    updatedAt: 1,
    createdAt: 1,
    recipeCount: 3,
    coverThumbs: [],
    sections: [],
    ...over,
  } as PrintProjectSummary;
}

/** A summary carrying recipe ids, which is what fork detection compares. */
function book(id: string, updatedAt: number, itemIds: string[]): PrintProjectSummary {
  return summary({
    id,
    updatedAt,
    createdAt: updatedAt,
    sections: [{ id: "s1", itemIds } as PrintProjectSummary["sections"][number]],
  });
}

const paid = (...ids: string[]) => (id: string) => ids.includes(id);
const nonePaid = () => false;

describe("what is in the library", () => {
  it("lists the account's projects", () => {
    const listed = libraryProjects({
      accountProjects: [summary({ id: "a" }), summary({ id: "b" })],
      localProjects: [],
      isPaidCookbook: nonePaid,
    });
    expect(listed.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  /* The bug this function exists for. */
  it("lists a paid, device-only cookbook even when signed in", () => {
    const listed = libraryProjects({
      accountProjects: [summary({ id: "in-account" })],
      localProjects: [summary({ id: "bought-signed-out" })],
      isPaidCookbook: paid("bought-signed-out"),
    });
    expect(listed.map((p) => p.id).sort()).toEqual(["bought-signed-out", "in-account"]);
  });

  it("still hides an unpaid device-only draft, signed in or out", () => {
    const local = [summary({ id: "draft" })];
    expect(
      libraryProjects({ accountProjects: [summary({ id: "a" })], localProjects: local, isPaidCookbook: nonePaid })
        .map((p) => p.id),
    ).toEqual(["a"]);
    // Signed out is the same call with no account projects.
    expect(
      libraryProjects({ accountProjects: [], localProjects: local, isPaidCookbook: nonePaid }),
    ).toEqual([]);
  });

  it("never lists recipe cards off the device shelf, paid or not", () => {
    const listed = libraryProjects({
      accountProjects: [],
      localProjects: [summary({ id: "cards", kind: "printProject" })],
      isPaidCookbook: paid("cards"),
    });
    expect(listed).toEqual([]);
  });

  it("lists a book the account already holds once, not twice", () => {
    const listed = libraryProjects({
      accountProjects: [summary({ id: "book" })],
      localProjects: [summary({ id: "book" })],
      isPaidCookbook: paid("book"),
    });
    expect(listed.map((p) => p.id)).toEqual(["book"]);
  });

  it("puts the newest first", () => {
    const listed = libraryProjects({
      accountProjects: [summary({ id: "old", updatedAt: 10 }), summary({ id: "new", updatedAt: 99 })],
      localProjects: [summary({ id: "middle", updatedAt: 50 })],
      isPaidCookbook: paid("middle"),
    });
    expect(listed.map((p) => p.id)).toEqual(["new", "middle", "old"]);
  });

  /* Stale forks from an old autosave bug are hidden wherever the library is
     shown — a cook should never catch sight of the mess. The DELETION still
     belongs to /projects, which knows which copies are purchased. */
  it("hides duplicate forks of the same book", () => {
    const recipeIds = ["r1", "r2", "r3"];
    const listed = libraryProjects({
      accountProjects: [
        book("keeper", 300, recipeIds),
        book("fork-1", 200, recipeIds),
        book("fork-2", 100, recipeIds),
      ],
      localProjects: [],
      isPaidCookbook: nonePaid,
    });
    expect(listed.map((p) => p.id)).toEqual(["keeper"]);
  });
});
