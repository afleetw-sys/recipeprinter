import type {
  CookbookFrontMatter,
  CoverConfig,
  CookbookPresetId,
  QueueItem,
  RecipePagePlacement,
  RecipePrintTemplate,
} from "@/types/recipe";
import { uid } from "@/lib/ids";
import type { PhotoStyle, ProjectMeta } from "@/lib/project";

/**
 * The one-way "make a cookbook from these recipes" / "make recipe cards from
 * this book" action, replacing the old reversible `cookbookMode` toggle for
 * every document that hasn't already entered that mechanism (see
 * `isLegacyCookbookMechanism` in lib/project.ts).
 *
 * Both directions mint a brand-new project id and deep-copy every recipe and
 * section onto fresh ids of their own — never the source's. That isn't for
 * `lib/duplicateProjects.ts`'s sake (a `kind` mismatch already keeps the two
 * from ever being paired as an accidental fork); it's what makes the two
 * documents genuinely independent everywhere else an id is a key —
 * `itemPlacements`, a locally-held photo blob, the content-index that maps a
 * recipe set back to a project id. Photos themselves are never re-uploaded:
 * Storage is keyed by owner uid, not project id, so a copy for the same
 * signed-in owner can reference the source's photo URLs verbatim.
 */

export interface ProjectCopySource {
  meta: ProjectMeta;
  items: QueueItem[];
}

export interface ProjectCopyResult {
  meta: ProjectMeta;
  items: QueueItem[];
}

/** What `buildCookbookScaffoldPatch` (app/print/page.tsx) computes for a
    fresh book — a cover, a table of contents, and chapters when there's
    enough to group. Kept out of this file because it needs page-local
    machinery (the premium-theme rotation, the organizer) that has nothing to
    do with copying. */
export interface CookbookScaffoldPatch {
  template: RecipePrintTemplate;
  cookbookPreset?: CookbookPresetId;
  photoStyle?: PhotoStyle;
  cover?: CoverConfig;
  backCover?: CoverConfig;
  tableOfContents: boolean;
  sectionDividers: boolean;
  frontMatter?: CookbookFrontMatter;
  /** Auto-organized chapters, only when the scaffold decided there was
      enough to group and nothing was already organized by hand. */
  sections?: ProjectMeta["sections"];
}

/** Deep-copies every item onto a fresh id, dropping `localPhotoId` (a
    reference into `lib/localPhotos.ts` keyed by the OLD id, which would
    dangle against the new one — the photo itself, once it has a real URL,
    needs no such reference). Returns the id map so section membership and
    per-recipe placements can be rewritten to match. */
function remapItemIds(items: QueueItem[]): { items: QueueItem[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const newItems = items.map((item) => {
    const newId = uid();
    idMap.set(item.id, newId);
    const { localPhotoId: _localPhotoId, ...rest } = item;
    return { ...rest, id: newId };
  });
  return { items: newItems, idMap };
}

function remapSections(
  sections: ProjectMeta["sections"],
  idMap: Map<string, string>,
): ProjectMeta["sections"] {
  return sections.map((section) => ({
    ...section,
    id: uid(),
    itemIds: section.itemIds
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id)),
  }));
}

function remapPlacements(
  placements: Record<string, RecipePagePlacement> | undefined,
  idMap: Map<string, string>,
): Record<string, RecipePagePlacement> | undefined {
  if (!placements) return undefined;
  const next: Record<string, RecipePagePlacement> = {};
  for (const [oldId, placement] of Object.entries(placements)) {
    const newId = idMap.get(oldId);
    if (newId) next[newId] = placement;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Copies the current recipes into a brand-new, independent cookbook. Applies
    `scaffold` (the same defaults `scaffoldCookbook` gives a fresh book) on
    top of whatever the source already had — a cover the cook already set on
    the cards project, say, still wins. */
export function copyCardsToNewCookbook(
  source: ProjectCopySource,
  scaffold: CookbookScaffoldPatch,
): ProjectCopyResult {
  const { items: newItems, idMap } = remapItemIds(source.items);
  const sections = scaffold.sections
    ? remapSections(scaffold.sections, idMap)
    : remapSections(source.meta.sections, idMap);
  const meta: ProjectMeta = {
    projectId: uid(),
    sourceProjectId: source.meta.projectId,
    cookbookMode: true,
    cookbookWelcomeCompleted: true,
    cookbookPreset: scaffold.cookbookPreset ?? source.meta.cookbookPreset,
    photoStyle: scaffold.photoStyle ?? source.meta.photoStyle,
    cover: scaffold.cover ?? source.meta.cover,
    backCover: scaffold.backCover ?? source.meta.backCover,
    tableOfContents: scaffold.tableOfContents,
    sectionDividers: scaffold.sectionDividers,
    frontMatter: scaffold.frontMatter ?? source.meta.frontMatter,
    dedication: source.meta.dedication,
    tocKicker: source.meta.tocKicker,
    tocTitle: source.meta.tocTitle,
    railSortMode: source.meta.railSortMode,
    lastImportSource: source.meta.lastImportSource,
    sections,
    itemPlacements: remapPlacements(source.meta.itemPlacements, idMap),
  };
  return { meta, items: newItems };
}

/** Copies this book's recipes into a brand-new, independent recipe-cards
    project. Mirrors `exitCookbook`'s field selection (lib/project.ts) — every
    cookbook-only artifact (cover, chapters, TOC, per-recipe placements) is
    dropped rather than stashed, since there is no shared document for a later
    "switch back" to restore it into. Collapses to one implicit section,
    matching what `exitCookbook` leaves behind today. */
export function copyCookbookToNewCards(source: ProjectCopySource): ProjectCopyResult {
  const { items: newItems } = remapItemIds(source.items);
  const meta: ProjectMeta = {
    projectId: uid(),
    sourceProjectId: source.meta.projectId,
    cookbookMode: false,
    cookbookWelcomeCompleted: source.meta.cookbookWelcomeCompleted,
    lastImportSource: source.meta.lastImportSource,
    sections: [],
  };
  return { meta, items: newItems };
}
