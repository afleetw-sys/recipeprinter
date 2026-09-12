import { COOKBOOK_CATEGORIES, classifyRecipe } from "@/lib/cookbookClassifier";
import type { ProjectMeta } from "@/lib/project";
import type { QueueItem } from "@/types/recipe";

export interface CookbookOrganizationSection {
  id: string;
  title: string;
  showOpener: boolean;
  itemIds: string[];
}

export interface CookbookOrganizationDraft {
  sections: CookbookOrganizationSection[];
}

// The classifier's catch-all CATEGORY key stays "Uncategorized" (internal), but
// its printed CHAPTER title should read like something a cook wants in a
// keepsake book — not a dev label — since the conservative classifier sends a
// lot of recipes here.
const CATCH_ALL_CATEGORY = "Uncategorized";
const CATCH_ALL_TITLE = "More Recipes";

export function suggestCookbookOrganization(items: QueueItem[]): CookbookOrganizationDraft {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    if (!item.recipe) continue;
    const category = classifyRecipe(item.recipe).category;
    groups.set(category, [...(groups.get(category) ?? []), item.id]);
  }

  const ordered = [...COOKBOOK_CATEGORIES, CATCH_ALL_CATEGORY] as const;
  return {
    sections: ordered
      .filter((category) => (groups.get(category)?.length ?? 0) > 0)
      .map((category) => ({
        id: `suggested-${category.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: category === CATCH_ALL_CATEGORY ? CATCH_ALL_TITLE : category,
        showOpener: true,
        itemIds: groups.get(category) ?? [],
      })),
  };
}

type PersistedSection = ProjectMeta["sections"][number];

/** Chapters are matched to existing ones by NAME, so the lookup has to agree
    with itself about case and stray spacing. */
function chapterKey(title: string | undefined): string {
  return (title ?? "").trim().toLocaleLowerCase();
}

/**
 * Converts a temporary review draft into persisted section metadata while
 * guaranteeing each current recipe appears exactly once.
 *
 * `existing` is what the book already has, and it is here because applying an
 * organization used to REPLACE the section list outright. Every chapter opener
 * the cook had built — its photo, its collage, its intro line, its subtitle,
 * whether it is numbered — was discarded the moment they pressed "Organize for
 * me", behind a single in-memory Undo that a reload spent. The automatic run at
 * build time is safe (it only fires when no chapter is named yet), so this was
 * the button doing it, on the books most likely to have that work in them.
 *
 * Matched by NAME rather than by id, because the draft mints its own ids from
 * the classifier's categories and the cook's "Desserts" and the suggestion's
 * "Desserts" are the same chapter by any reading a person would give it. The
 * existing id is carried over with the art, so anything else keyed to that
 * chapter stays attached to it.
 *
 * What this deliberately does NOT do is find a home for a chapter the
 * suggestion has no counterpart for. Re-organizing is a re-chaptering, and a
 * chapter that no longer exists has nowhere for its photo to go; the rule here
 * is only that agreeing on a chapter should not cost you what you put in it.
 */
export function organizationSectionsForApply(
  draft: CookbookOrganizationDraft,
  currentItemIds: string[],
  existing: readonly PersistedSection[] = [],
): ProjectMeta["sections"] {
  const valid = new Set(currentItemIds);
  const used = new Set<string>();
  const byTitle = new Map<string, PersistedSection>();
  for (const section of existing) {
    const key = chapterKey(section.title);
    // First one wins: two chapters of the same name are already ambiguous, and
    // the earlier is the one the book reads as that chapter.
    if (key && !byTitle.has(key)) byTitle.set(key, section);
  }

  /** The draft's chapter, wearing whatever the book had already put on it. */
  const dressed = (section: CookbookOrganizationSection, title: string): PersistedSection => {
    const kept = byTitle.get(chapterKey(title));
    if (!kept) return { id: section.id, title, showOpener: true, itemIds: [] };
    return {
      ...kept,
      id: kept.id,
      title,
      showOpener: true,
      itemIds: [],
    };
  };

  const sections = draft.sections.map((section) => {
    const title = section.title.trim() || "Untitled section";
    return {
      ...dressed(section, title),
      itemIds: section.itemIds.filter((id) => {
        if (!valid.has(id) || used.has(id)) return false;
        used.add(id);
        return true;
      }),
    };
  });
  const missing = currentItemIds.filter((id) => !used.has(id));
  if (missing.length > 0) {
    const catchAll = sections.find((section) => section.title === CATCH_ALL_TITLE);
    if (catchAll) catchAll.itemIds.push(...missing);
    else {
      sections.push({
        ...dressed({ id: "suggested-uncategorized", title: CATCH_ALL_TITLE, showOpener: true, itemIds: [] }, CATCH_ALL_TITLE),
        itemIds: missing,
      });
    }
  }
  return sections.filter((section) => section.itemIds.length > 0);
}

