import type { Section } from "@/types/recipe";

/** The move menu's destination for recipes in no chapter, and what the
    organizer calls them. Not a section id: there may be no such group yet. */
export const NOT_IN_A_CHAPTER = "not-in-a-chapter";
export const NOT_IN_A_CHAPTER_LABEL = "Not in a chapter";

/**
 * Where "Move to…" can send these recipes: "Not in a chapter" when any of them
 * is in one, then every named chapter that doesn't already hold them all. The
 * desktop rail's right-click menu and a phone's long press list the same
 * places (components/print/MoveToSectionMenu).
 */
export function recipeMoveDestinations(
  ids: readonly string[],
  sections: readonly Section[],
  itemIdsForSection: (sectionId: string) => string[],
  chapterTitleOf: (itemId: string) => string | undefined,
): Array<{ id: string; title?: string }> {
  return [
    ...(ids.some((id) => chapterTitleOf(id)) ? [{ id: NOT_IN_A_CHAPTER, title: NOT_IN_A_CHAPTER_LABEL }] : []),
    ...sections.filter((section) => {
      if (!section.title?.trim()) return false;
      const held = itemIdsForSection(section.id);
      // A section every moved recipe is already in has nowhere to move them.
      return !ids.every((id) => held.includes(id));
    }),
  ];
}
