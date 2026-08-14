"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CookbookFrontMatter,
  CookbookPresetId,
  CoverConfig,
  QueueItem,
  RecipePagePlacement,
  Section,
  SectionPhotoMode,
} from "@/types/recipe";
import { uid } from "@/lib/ids";
import { localStore, sessionStore } from "@/lib/storage";

// The section/cover layer is purely organizational — which section each
// queued recipe belongs to, plus section/cover metadata — kept separate from
// the recipe content itself (still owned by lib/queue.ts and the /print
// page's own item state). Joining `ProjectMeta` against the live item list at
// render time means a recipe's content never has to be duplicated into a
// second store, and edits made through the existing inline editor (which
// already knows how to update the queue) just keep working.
//
// No project-title concept here on purpose: there's no UI surface for it yet
// (see the /print page), so a saved project just gets an assembled-at-save
// default name instead of a field this store would have to own and no one
// could ever change.

export const PROJECT_META_STORAGE_KEY = "recipeprinter:project-meta:v1";
// Durable backup of the section/cover metadata, mirroring lib/queue.ts: the
// session copy is wiped on tab close, so this localStorage copy lets a reopened
// tab restore the in-progress book structure alongside its recipes.
const PROJECT_META_RECOVERY_STORAGE_KEY = "recipeprinter:project-meta:recovery:v1";

/** Book-wide default treatment for recipe photos (cookbook mode):
    - `none` — no recipe photos anywhere;
    - `card` — a header photo inside each recipe card;
    - `full` — a full-page photo facing each recipe (image spread).
    The per-page layout picker overrides individual recipes on top of this. */
export type PhotoStyle = "none" | "card" | "full";

const SECTION_PHOTO_MODES: readonly SectionPhotoMode[] = ["none", "band", "full", "grid"];

/** The effective opener photo placement for a section. Explicit `photoMode` wins;
    otherwise a stored `photoUrl` means the legacy top-band photo (`band`), and a
    bare section is typographic (`none`). Shared by the sheet builder and the
    picker so the printed page and the dialog can never disagree. */
export function resolveSectionPhotoMode(section: {
  photoMode?: SectionPhotoMode;
  photoUrl?: string;
}): SectionPhotoMode {
  if (section.photoMode) return section.photoMode;
  return section.photoUrl ? "band" : "none";
}

export function recipePagePlacementHasValues(placement: RecipePagePlacement): boolean {
  return (
    placement.pageLayout !== undefined ||
    placement.heroImageUrl !== undefined ||
    placement.heroFocusX !== undefined ||
    placement.heroFocusY !== undefined ||
    placement.showPhoto !== undefined
  );
}

export interface ProjectMeta {
  /** Stable identity for purchase scoping and saved-project hydration. */
  projectId?: string;
  cover?: CoverConfig;
  backCover?: CoverConfig;
  /** Optional dedication / front-matter page shown after the cover, before the
      table of contents. A CoverConfig (like the back cover) whose `blurb` is the
      dedication text; absent = no dedication page. */
  dedication?: CoverConfig;
  frontMatter?: CookbookFrontMatter;
  cookbookWelcomeCompleted?: boolean;
  /** Book-wide recipe-photo default (cookbook). See PhotoStyle. Absent = the
      plain-card default ("card") — a header photo in each recipe card. */
  photoStyle?: PhotoStyle;
  /** Whether the cookbook renders a table-of-contents page. */
  tableOfContents?: boolean;
  /** Editable TOC heading text (the entries themselves are derived from the
      pages). Default to "Contents"/"What's inside" when unset. */
  tocKicker?: string;
  tocTitle?: string;
  sectionDividers?: boolean;
  /** Opted into the cookbook experience (cover/sections) via "Make it a
      cookbook" — false/undefined means the plain print-cards UI. Gated off at
      the entry points for now; see COOKBOOK_ENABLED in lib/cookbookProduct.ts. */
  cookbookMode?: boolean;
  /** The print-format preset this cookbook exports at (trim/bleed/margin/gutter
      — see lib/cookbookPresets.ts). Absent = the default preset. Cookbook-only;
      cleared by `exitCookbook`. */
  cookbookPreset?: CookbookPresetId;
  /** Section metadata only (id/title/order/chapter-opener fields) — item ids,
      not recipe content. `photoUrl`/`intro` drive the cookbook chapter opener. */
  sections: Array<{
    id: string;
    title?: string;
    subtitle?: string;
    photoUrl?: string;
    photoMode?: SectionPhotoMode;
    gridImages?: string[];
    intro?: string;
    showOpener?: boolean;
    numberAsChapter?: boolean;
    itemIds: string[];
  }>;
  /** Per-recipe cookbook page layout (full/half/image-spread), keyed by
      `QueueItem.id`. Kept out of the section list so the import/parse/queue
      lifecycle stays untouched by a book-only concern (see the type's comment).
      Absent/`full` = one card per sheet, i.e. today's behavior. */
  itemPlacements?: Record<string, RecipePagePlacement>;
  /** Set by `exitCookbook` when the cook switches back to plain recipe cards:
      the whole book (cover, chapters, layouts, settings) tucked away so a later
      `restoreCookbook` brings it back exactly. Absent = no book to restore.
      Never read by the renderer — recipe-cards mode sees a meta with no
      cookbook fields, identical to a project that never had a book. */
  stashedCookbook?: StashedCookbook;
}

/** Everything cookbook-specific that `exitCookbook` sets aside so switching back
    to the book restores it intact, rather than making the cook rebuild it. */
type StashedCookbook = Pick<
  ProjectMeta,
  | "cover"
  | "backCover"
  | "dedication"
  | "frontMatter"
  | "photoStyle"
  | "tableOfContents"
  | "tocKicker"
  | "tocTitle"
  | "sectionDividers"
  | "cookbookPreset"
  | "sections"
  | "itemPlacements"
>;

const EMPTY_META: ProjectMeta = { sections: [] };

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Normalizes legacy/session data without discarding unknown recipe content. */
export function normalizeProjectMeta(value: unknown): ProjectMeta {
  if (!value || typeof value !== "object") return { sections: [], projectId: uid() };
  const raw = value as Partial<ProjectMeta>;
  const legacyOpeners = Boolean(raw.sectionDividers);
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .filter((section) => section && typeof section === "object" && typeof section.id === "string")
        .map((section) => ({
          id: section.id,
          title: cleanText(section.title),
          subtitle: cleanText(section.subtitle),
          photoUrl: cleanText(section.photoUrl),
          photoMode:
            SECTION_PHOTO_MODES.includes(section.photoMode as SectionPhotoMode)
              ? (section.photoMode as SectionPhotoMode)
              : undefined,
          gridImages: Array.isArray(section.gridImages)
            ? section.gridImages.filter((url): url is string => typeof url === "string" && Boolean(url))
            : undefined,
          intro: cleanText(section.intro),
          // Named cookbook sections always receive an opener. Keep the field
          // in persisted data for backward compatibility, but never preserve
          // an old user-disabled value.
          showOpener: Boolean(cleanText(section.title)),
          numberAsChapter:
            typeof section.numberAsChapter === "boolean"
              ? section.numberAsChapter
              : legacyOpeners && Boolean(cleanText(section.title)),
          itemIds: Array.isArray(section.itemIds)
            ? section.itemIds.filter((id): id is string => typeof id === "string")
            : [],
        }))
    : [];
  const legacyDedication = raw.dedication?.blurb?.trim();
  return {
    ...raw,
    projectId: cleanText(raw.projectId) ?? uid(),
    sections,
    cover: raw.cover
      ? {
          ...raw.cover,
          layout:
            raw.cover.layout ??
            (raw.cover.gridImages?.length
              ? "collage"
              : raw.cover.imageUrl
                ? "photo"
                : "typographic"),
        }
      : undefined,
    frontMatter:
      raw.frontMatter ??
      (legacyDedication
        ? { kind: "dedication", heading: "Dedication", body: legacyDedication }
        : undefined),
  };
}

function readMeta(): ProjectMeta {
  // Per-tab session copy wins; fall back to the durable mirror to restore a
  // reopened tab, reseeding this tab's session from it (see lib/queue.ts).
  let parsed = sessionStore.getJson<ProjectMeta>(PROJECT_META_STORAGE_KEY);
  if (parsed === null) {
    const recovered = localStore.getJson<ProjectMeta>(PROJECT_META_RECOVERY_STORAGE_KEY);
    if (recovered !== null) {
      parsed = recovered;
      sessionStore.setJson(PROJECT_META_STORAGE_KEY, recovered);
    }
  }
  return normalizeProjectMeta(parsed);
}

function writeMeta(meta: ProjectMeta) {
  // Survivable if it fails: meta stays correct in memory for this page.
  sessionStore.setJson(PROJECT_META_STORAGE_KEY, meta);
  // Mirror to the durable backup so book structure survives a tab close.
  localStore.setJson(PROJECT_META_RECOVERY_STORAGE_KEY, meta);
}

/**
 * Joins section metadata against the live item list into full `Section[]`.
 * Items not yet assigned to any known section (new arrivals from Add recipe,
 * or the very first load) land in the first section, creating an implicit
 * untitled one if none exists yet — every project always has at least one
 * section. Ids in the meta that no longer exist in `items` are dropped.
 */
export function buildSections(items: QueueItem[], meta: ProjectMeta): Section[] {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const assigned = new Set<string>();

  const sections: Section[] = meta.sections
    .map((section) => {
      const sectionItems = section.itemIds
        .map((id) => byId.get(id))
        .filter((item): item is QueueItem => Boolean(item));
      sectionItems.forEach((item) => assigned.add(item.id));
      return {
        id: section.id,
        title: section.title,
        subtitle: section.subtitle,
        photoUrl: section.photoUrl,
        photoMode: section.photoMode,
        gridImages: section.gridImages,
        intro: section.intro,
        showOpener: section.showOpener,
        numberAsChapter: section.numberAsChapter,
        items: sectionItems,
      };
    })
    .filter((section) => section.items.length > 0 || section.title);

  const unassigned = items.filter((item) => !assigned.has(item.id));
  if (unassigned.length === 0 && sections.length > 0) return sections;

  if (sections.length === 0) {
    // Reuse the existing implicit section's id if there was exactly one
    // (empty and untitled, which is why it got filtered out above) rather
    // than minting a fresh one every call. A brand-new id here every time —
    // even when nothing about the project actually changed (e.g. an empty
    // queue) — looks "changed" to `syncSections`, which persists it, which
    // produces the same still-empty section next render, which gets
    // filtered out above, which mints yet another new id: an infinite loop
    // that never settles.
    const reuseId = meta.sections.length === 1 && !meta.sections[0].title ? meta.sections[0].id : uid();
    return [{ id: reuseId, items: unassigned }];
  }

  // New/unassigned items join the first section, in queue order, appended
  // after whatever's already there.
  const [first, ...rest] = sections;
  return [{ ...first, items: [...first.items, ...unassigned] }, ...rest];
}

/** Flattens sections back into a single ordered item list — the shape most
    existing rendering/measurement code still expects. */
export function flattenSections(sections: Section[]): QueueItem[] {
  return sections.flatMap((section) => section.items);
}

export function namedSectionCount(sections: Section[]): number {
  return sections.filter((section) => section.title?.trim()).length;
}

function metaSectionsFromFull(sections: Section[]): ProjectMeta["sections"] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    subtitle: section.subtitle,
    photoUrl: section.photoUrl,
    photoMode: section.photoMode,
    gridImages: section.gridImages,
    intro: section.intro,
    showOpener: section.showOpener,
    numberAsChapter: section.numberAsChapter,
    itemIds: section.items.map((item) => item.id),
  }));
}

function stringArraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((value, i) => value === y[i]);
}

/** Structural equality for two persisted section lists. The single home for
    "did the section metadata actually change?", so `syncSections`' write-back
    round-trip has one field list to keep in step with `metaSectionsFromFull`
    (right above) instead of a second, drift-prone inline diff. Order-insensitive
    per field (never a `JSON.stringify` compare, whose key-order sensitivity could
    reintroduce the `buildSections` implicit-section loop documented above). */
function sectionsMetaEqual(a: ProjectMeta["sections"], b: ProjectMeta["sections"]): boolean {
  return (
    a.length === b.length &&
    a.every((section, index) => {
      const other = b[index];
      return (
        section.id === other.id &&
        section.title === other.title &&
        section.subtitle === other.subtitle &&
        section.photoUrl === other.photoUrl &&
        section.photoMode === other.photoMode &&
        section.intro === other.intro &&
        section.showOpener === other.showOpener &&
        section.numberAsChapter === other.numberAsChapter &&
        stringArraysEqual(section.gridImages, other.gridImages) &&
        stringArraysEqual(section.itemIds, other.itemIds)
      );
    })
  );
}

/**
 * Removes a section, merging its recipes into a neighbor — the section just
 * before it, or the one just after when deleting the first. Deleting the only
 * section dissolves it back to an implicit ungrouped pool. Pure; the hook's
 * `deleteSection` wraps this. Exported for testing.
 */
export function deleteSectionFromMeta(meta: ProjectMeta, sectionId: string): ProjectMeta {
  const index = meta.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return meta;
  const target = meta.sections[index];
  if (meta.sections.length === 1) {
    return { ...meta, sections: [{ id: target.id, itemIds: [...target.itemIds] }] };
  }
  // Capture the inheriting neighbor by identity BEFORE removing the target.
  // Computing an index into the post-removal array is off-by-one-prone (the
  // previous version merged into the wrong section, or nowhere at all).
  const neighborId = meta.sections[index > 0 ? index - 1 : index + 1].id;
  const sections = meta.sections
    .filter((section) => section.id !== sectionId)
    .map((section) => ({ ...section, itemIds: [...section.itemIds] }));
  const neighbor = sections.find((section) => section.id === neighborId);
  if (neighbor) {
    neighbor.itemIds = [...neighbor.itemIds, ...target.itemIds];
  }
  return { ...meta, sections };
}

export function useProjectMeta() {
  const [meta, setMeta] = useState<ProjectMeta>(EMPTY_META);
  const [hydrated, setHydrated] = useState(false);
  const metaRef = useRef<ProjectMeta>(EMPTY_META);

  useEffect(() => {
    const initial = readMeta();
    metaRef.current = initial;
    setMeta(initial);
    writeMeta(initial);
    setHydrated(true);
  }, []);

  const commit = useCallback((next: ProjectMeta) => {
    metaRef.current = next;
    setMeta(next);
    writeMeta(next);
  }, []);

  const update = useCallback(
    (updater: (current: ProjectMeta) => ProjectMeta) => {
      commit(updater(metaRef.current));
    },
    [commit],
  );

  /** Call after computing full `Section[]` (via buildSections) so newly
      auto-assigned items and any implicit first section get persisted. */
  const syncSections = useCallback(
    (sections: Section[]) => {
      const nextSections = metaSectionsFromFull(sections);
      const current = metaRef.current;
      if (!sectionsMetaEqual(current.sections, nextSections)) {
        commit({ ...current, sections: nextSections });
      }
    },
    [commit],
  );

  const addSection = useCallback(
    (title?: string) => {
      const id = uid();
      update((current) => ({
        ...current,
        sections: [...current.sections, { id, title, showOpener: Boolean(title?.trim()), itemIds: [] }],
      }));
      return id;
    },
    [update],
  );

  const renameSection = useCallback(
    (sectionId: string, title: string | undefined) => {
      update((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId ? { ...section, title } : section,
        ),
      }));
    },
    [update],
  );

  /** Sets a section opener's photo PLACEMENT, mirroring `setItemPhotoMode` for
      recipes. `none` clears everything; `band`/`full` set the single `photoUrl`
      (kept if `opts.photoUrl` is omitted) and drop any grid; `grid` sets the
      curated `gridImages`. Keeping mode + payload in one setter means the
      persisted `photoMode` can never drift out of sync with the photo it names. */
  const setSectionPhotoMode = useCallback(
    (
      sectionId: string,
      mode: SectionPhotoMode,
      opts?: { photoUrl?: string; gridImages?: string[] },
    ) => {
      update((current) => ({
        ...current,
        sections: current.sections.map((section) => {
          if (section.id !== sectionId) return section;
          if (mode === "none") {
            return { ...section, photoMode: "none", photoUrl: undefined, gridImages: undefined };
          }
          if (mode === "grid") {
            return {
              ...section,
              photoMode: "grid",
              gridImages: (opts?.gridImages ?? section.gridImages ?? []).filter(Boolean),
            };
          }
          // band | full — a single facing/band photo, no grid.
          return {
            ...section,
            photoMode: mode,
            photoUrl:
              opts?.photoUrl !== undefined ? opts.photoUrl || undefined : section.photoUrl,
            gridImages: undefined,
          };
        }),
      }));
    },
    [update],
  );

  /** Chapter-opener photo for a section (cookbook mode). Empty/undefined clears
      it. Thin wrapper over `setSectionPhotoMode` so the legacy single-photo path
      keeps `photoMode` consistent: a url means the in-card `band`, clearing means
      `none`. */
  const setSectionPhoto = useCallback(
    (sectionId: string, photoUrl: string | undefined) => {
      setSectionPhotoMode(sectionId, photoUrl ? "band" : "none", { photoUrl });
    },
    [setSectionPhotoMode],
  );

  /** Chapter-opener intro line for a section (cookbook mode). */
  const setSectionIntro = useCallback(
    (sectionId: string, intro: string | undefined) => {
      update((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId ? { ...section, intro: intro || undefined } : section,
        ),
      }));
    },
    [update],
  );

  const updateSection = useCallback(
    (
      sectionId: string,
      patch: Partial<
        Pick<
          ProjectMeta["sections"][number],
          "title" | "subtitle" | "photoUrl" | "photoMode" | "gridImages" | "intro" | "showOpener"
        >
      >,
    ) => {
      update((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId ? { ...section, ...patch } : section,
        ),
      }));
    },
    [update],
  );

  /** Removes a section, merging its items into a neighbor. Deleting the final
      named section dissolves it back to the implicit ungrouped recipe pool. */
  const deleteSection = useCallback(
    (sectionId: string) => {
      update((current) => deleteSectionFromMeta(current, sectionId));
    },
    [update],
  );

  const moveItem = useCallback(
    (itemId: string, toSectionId: string, toIndex: number) => {
      update((current) => {
        const sections = current.sections.map((section) => ({
          ...section,
          itemIds: section.itemIds.filter((id) => id !== itemId),
        }));
        const target = sections.find((section) => section.id === toSectionId);
        if (!target) return current;
        const clampedIndex = Math.max(0, Math.min(toIndex, target.itemIds.length));
        target.itemIds.splice(clampedIndex, 0, itemId);
        return { ...current, sections };
      });
    },
    [update],
  );

  const reorderSections = useCallback(
    (fromIndex: number, toIndex: number) => {
      update((current) => {
        const sections = current.sections.slice();
        const [moved] = sections.splice(fromIndex, 1);
        if (!moved) return current;
        sections.splice(toIndex, 0, moved);
        return { ...current, sections };
      });
    },
    [update],
  );

  /** Replaces the whole section list at once — used by the "Make it a cookbook"
      scaffold to auto-group loose recipes into chapters. Fresh ids are minted
      here so callers pass only titles + item ids. */
  const replaceSections = useCallback(
    (groups: Array<{ title?: string; itemIds: string[] }>) => {
      update((current) => ({
        ...current,
        sections: groups.map((group) => ({
          id: uid(),
          title: group.title,
          itemIds: group.itemIds,
        })),
      }));
    },
    [update],
  );

  const setSectionStructure = useCallback(
    (sections: ProjectMeta["sections"]) => {
      update((current) => ({
        ...current,
        sections: sections.map((section) => ({
          ...section,
          itemIds: [...section.itemIds],
        })),
      }));
    },
    [update],
  );

  const setCover = useCallback(
    (cover: CoverConfig | undefined) => {
      update((current) => ({ ...current, cover }));
    },
    [update],
  );

  const setBackCover = useCallback(
    (backCover: CoverConfig | undefined) => {
      update((current) => ({ ...current, backCover }));
    },
    [update],
  );

  // The optional dedication / front-matter page. Modeled as a CoverConfig (like
  // the back cover — a quiet, template-skinned page) whose `blurb` holds the
  // dedication text; `undefined` means no dedication page.
  const setDedication = useCallback(
    (dedication: CoverConfig | undefined) => {
      update((current) => ({ ...current, dedication }));
    },
    [update],
  );

  const setFrontMatter = useCallback(
    (frontMatter: CookbookFrontMatter | undefined) => {
      update((current) => ({ ...current, frontMatter }));
    },
    [update],
  );

  const setCookbookWelcomeCompleted = useCallback(
    (value: boolean) => {
      update((current) => ({ ...current, cookbookWelcomeCompleted: value }));
    },
    [update],
  );

  // No callers right now — the TOC toggle is gone until a TOC page exists (see
  // `ProjectMeta.tableOfContents`). Left in place as part of this store's
  // surface, alongside the field it writes, so building the feature is a
  // matter of rendering a page rather than re-deriving the state plumbing.
  const setTableOfContents = useCallback(
    (value: boolean) => {
      update((current) => ({ ...current, tableOfContents: value }));
    },
    [update],
  );

  const setSectionDividers = useCallback(
    (value: boolean) => {
      update((current) => ({ ...current, sectionDividers: value }));
    },
    [update],
  );

  const setTocKicker = useCallback(
    (value: string | undefined) => {
      update((current) => ({ ...current, tocKicker: value || undefined }));
    },
    [update],
  );

  const setTocTitle = useCallback(
    (value: string | undefined) => {
      update((current) => ({ ...current, tocTitle: value || undefined }));
    },
    [update],
  );

  const setCookbookMode = useCallback(
    (value: boolean) => {
      update((current) => ({ ...current, cookbookMode: value }));
    },
    [update],
  );

  /** The cookbook's print-format preset (see lib/cookbookPresets.ts). Only the
      physical export geometry changes; the recipe layout engine is untouched. */
  const setCookbookPreset = useCallback(
    (value: CookbookPresetId) => {
      update((current) => ({ ...current, cookbookPreset: value }));
    },
    [update],
  );

  /** Leaving cookbook mode returns to a plain print job WITHOUT discarding the
      book: every cookbook-only artifact — cover, back cover, chapters/dividers,
      table of contents, per-recipe page layouts, and book settings — is tucked
      into `stashedCookbook` so `restoreCookbook` can bring it back untouched.
      The recipes themselves live in the queue; clearing `sections` collapses
      them into one implicit untitled section for card printing (see
      `buildSections`). */
  const exitCookbook = useCallback(() => {
    update((current) => {
      const stashedCookbook: StashedCookbook = {
        cover: current.cover,
        backCover: current.backCover,
        dedication: current.dedication,
        frontMatter: current.frontMatter,
        photoStyle: current.photoStyle,
        tableOfContents: current.tableOfContents,
        tocKicker: current.tocKicker,
        tocTitle: current.tocTitle,
        sectionDividers: current.sectionDividers,
        cookbookPreset: current.cookbookPreset,
        sections: current.sections,
        itemPlacements: current.itemPlacements,
      };
      return {
        projectId: current.projectId,
        cookbookWelcomeCompleted: current.cookbookWelcomeCompleted,
        sections: [],
        stashedCookbook,
      };
    });
  }, [update]);

  /** Re-enters cookbook mode from the stash left by `exitCookbook`, restoring
      the cover, chapters, layouts, and every book setting in a single commit.
      Returns false (a no-op) when nothing is stashed, so the caller can fall
      back to scaffolding a fresh book. */
  const restoreCookbook = useCallback(() => {
    if (!metaRef.current.stashedCookbook) return false;
    update((current) => {
      const { stashedCookbook, ...rest } = current;
      return { ...rest, ...stashedCookbook, cookbookMode: true };
    });
    return true;
  }, [update]);

  /** Sets (or, with `undefined`, clears back to the default `full`) a single
      recipe's cookbook page layout. Merges into the existing placement so a
      later heroImageUrl edit doesn't wipe the pageLayout and vice versa. */
  const setItemPlacement = useCallback(
    (itemId: string, placement: RecipePagePlacement | undefined) => {
      update((current) => {
        const next = { ...(current.itemPlacements ?? {}) };
        const merged = { ...next[itemId], ...placement };
        if (!placement || !recipePagePlacementHasValues(merged)) {
          delete next[itemId];
        } else {
          next[itemId] = merged;
        }
        return { ...current, itemPlacements: next };
      });
    },
    [update],
  );

  /** Book-wide recipe-photo default (cookbook). See PhotoStyle. */
  const setPhotoStyle = useCallback(
    (value: PhotoStyle) => {
      update((current) => ({ ...current, photoStyle: value }));
    },
    [update],
  );

  /** Drops every per-recipe photo PLACEMENT override (pageLayout + showPhoto) so
      all recipes fall back to the book-wide `photoStyle` — used when the cook
      picks a book-wide Photos option, which should override individual choices.
      A recipe's custom facing photo + focal point (heroImageUrl/heroFocus*) are
      kept, so a hand-picked full-page image survives the reset. */
  const clearItemPhotoOverrides = useCallback(() => {
    update((current) => {
      const placements = current.itemPlacements;
      if (!placements || Object.keys(placements).length === 0) return current;
      const next: Record<string, RecipePagePlacement> = {};
      for (const [id, placement] of Object.entries(placements)) {
        const kept: RecipePagePlacement = {};
        if (placement.heroImageUrl !== undefined) kept.heroImageUrl = placement.heroImageUrl;
        if (placement.heroFocusX !== undefined) kept.heroFocusX = placement.heroFocusX;
        if (placement.heroFocusY !== undefined) kept.heroFocusY = placement.heroFocusY;
        if (recipePagePlacementHasValues(kept)) next[id] = kept;
      }
      return { ...current, itemPlacements: next };
    });
  }, [update]);

  /** Replaces session metadata after a saved account project is verified. */
  const replaceMeta = useCallback(
    (next: ProjectMeta) => {
      commit(normalizeProjectMeta(next));
    },
    [commit],
  );

  /** Updates save identity without replacing newer edits made while an async
      save was in flight. */
  const setProjectId = useCallback(
    (projectId: string) => {
      update((current) => (current.projectId === projectId ? current : { ...current, projectId }));
    },
    [update],
  );

  /** Per-recipe override of how ONE recipe shows its photo, using the same three
      options as the book-wide `photoStyle`: `none` (no photo), `card` (a header
      photo), `full` (a full-page facing photo / image-spread). Stored explicitly
      as a placement so it overrides the book default; the caller clears the
      placement (setItemPlacement with `undefined`) to fall back to the book. */
  const setItemPhotoMode = useCallback(
    (itemId: string, mode: PhotoStyle, heroImageUrl?: string) => {
      update((current) => {
        const map = { ...(current.itemPlacements ?? {}) };
        if (mode === "full") {
          map[itemId] = { pageLayout: "image-spread", ...(heroImageUrl ? { heroImageUrl } : {}) };
        } else {
          map[itemId] = { pageLayout: "full", showPhoto: mode === "card" };
        }
        return { ...current, itemPlacements: map };
      });
    },
    [update],
  );

  return {
    meta,
    hydrated,
    syncSections,
    addSection,
    renameSection,
    setSectionPhoto,
    setSectionPhotoMode,
    setSectionIntro,
    updateSection,
    deleteSection,
    moveItem,
    reorderSections,
    replaceSections,
    setSectionStructure,
    setCover,
    setBackCover,
    setDedication,
    setFrontMatter,
    setCookbookWelcomeCompleted,
    setTableOfContents,
    setTocKicker,
    setTocTitle,
    setSectionDividers,
    setCookbookMode,
    setCookbookPreset,
    exitCookbook,
    restoreCookbook,
    setItemPlacement,
    setItemPhotoMode,
    clearItemPhotoOverrides,
    setPhotoStyle,
    replaceMeta,
    setProjectId,
  };
}
