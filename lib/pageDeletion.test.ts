import { describe, expect, it } from "vitest";
import { pageDeletionFor } from "@/lib/pageDeletion";
import type { NavItem } from "@/lib/usePrintSheets";

/* Delete acts on the page it was pressed on. A recipe's full-page photo had no
   case of its own and fell through to the cover branch, where an id that is not
   a cover's reads as the front: pressing Delete on the photo offered to remove
   the book's front cover. Every kind of page is checked, so a new kind that
   falls through fails here too. */

const PAGES: Array<Pick<NavItem, "kind" | "recipeId">> = [
  { kind: "recipe", recipeId: "r1" },
  { kind: "image", recipeId: "r1" },
  { kind: "divider", recipeId: "s1" },
  { kind: "section-photo", recipeId: "s1" },
  { kind: "blank", recipeId: "page-1" },
  { kind: "toc", recipeId: "toc" },
  { kind: "cover", recipeId: "cover-front" },
  { kind: "cover", recipeId: "cover-back" },
  { kind: "cover", recipeId: "cover-dedication" },
];

describe("deleting a page", () => {
  it("acts on that page and no other", () => {
    for (const page of PAGES) {
      const deletion = pageDeletionFor(page);
      if (page.kind === "cover") {
        expect(deletion, page.recipeId).toEqual({ kind: "cover", side: page.recipeId.replace("cover-", "") });
      } else {
        expect(deletion.kind, `${page.kind} page`).not.toBe("cover");
      }
    }
  });
});
