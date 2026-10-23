import type { NavItem } from "@/lib/usePrintSheets";

/**
 * What pressing Delete on a page acts on. Every page names itself: deleting a
 * page never reaches a different one.
 *
 * Kept out of the print page so it can be checked on its own. The cover branch
 * used to be the fall-through for every kind not listed, and a cover's side
 * comes from its id with "front" as the default, so a page that was not a
 * cover at all read as the FRONT cover (see the test).
 */
export type PageDeletion =
  | { kind: "recipe"; recipeId: string }
  /** A recipe's full-page photo: the page goes, the photo moves back into the
      recipe's own page. */
  | { kind: "recipe-photo-page"; recipeId: string }
  | { kind: "chapter"; sectionId: string }
  | { kind: "chapter-photo-page"; sectionId: string }
  | { kind: "book-page"; pageId: string }
  | { kind: "contents" }
  | { kind: "cover"; side: "front" | "back" | "dedication" };

export function coverSideOf(navItem: Pick<NavItem, "recipeId">): "front" | "back" | "dedication" {
  if (navItem.recipeId === "cover-back") return "back";
  if (navItem.recipeId === "cover-dedication") return "dedication";
  return "front";
}

export function pageDeletionFor(navItem: Pick<NavItem, "kind" | "recipeId">): PageDeletion {
  switch (navItem.kind) {
    case "recipe":
      return { kind: "recipe", recipeId: navItem.recipeId };
    case "image":
      return { kind: "recipe-photo-page", recipeId: navItem.recipeId };
    case "divider":
      return { kind: "chapter", sectionId: navItem.recipeId };
    case "section-photo":
      return { kind: "chapter-photo-page", sectionId: navItem.recipeId };
    case "blank":
      return { kind: "book-page", pageId: navItem.recipeId };
    case "toc":
      return { kind: "contents" };
    default:
      return { kind: "cover", side: coverSideOf(navItem) };
  }
}
