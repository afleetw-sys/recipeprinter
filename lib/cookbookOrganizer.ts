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

export function suggestCookbookOrganization(items: QueueItem[]): CookbookOrganizationDraft {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    if (!item.recipe) continue;
    const category = classifyRecipe(item.recipe).category;
    groups.set(category, [...(groups.get(category) ?? []), item.id]);
  }

  const ordered = [...COOKBOOK_CATEGORIES, "Uncategorized"] as const;
  return {
    sections: ordered
      .filter((title) => (groups.get(title)?.length ?? 0) > 0)
      .map((title) => ({
        id: `suggested-${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title,
        showOpener: true,
        itemIds: groups.get(title) ?? [],
      })),
  };
}

/** Converts a temporary review draft into persisted section metadata while
    guaranteeing each current recipe appears exactly once. */
export function organizationSectionsForApply(
  draft: CookbookOrganizationDraft,
  currentItemIds: string[],
): ProjectMeta["sections"] {
  const valid = new Set(currentItemIds);
  const used = new Set<string>();
  const sections = draft.sections.map((section) => ({
    id: section.id,
    title: section.title.trim() || "Untitled section",
    showOpener: true,
    itemIds: section.itemIds.filter((id) => {
      if (!valid.has(id) || used.has(id)) return false;
      used.add(id);
      return true;
    }),
  }));
  const missing = currentItemIds.filter((id) => !used.has(id));
  if (missing.length > 0) {
    const uncategorized = sections.find((section) => section.title === "Uncategorized");
    if (uncategorized) uncategorized.itemIds.push(...missing);
    else {
      sections.push({
        id: "suggested-uncategorized",
        title: "Uncategorized",
        showOpener: true,
        itemIds: missing,
      });
    }
  }
  return sections.filter((section) => section.itemIds.length > 0);
}

export function moveOrganizationItem(
  draft: CookbookOrganizationDraft,
  itemId: string,
  targetSectionId: string,
): CookbookOrganizationDraft {
  return {
    sections: draft.sections.map((section) => ({
      ...section,
      itemIds:
        section.id === targetSectionId
          ? [...section.itemIds.filter((id) => id !== itemId), itemId]
          : section.itemIds.filter((id) => id !== itemId),
    })),
  };
}
