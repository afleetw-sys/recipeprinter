"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CookbookPresetId, CoverConfig, QueueItem, RecipePagePlacement, Section } from "@/types/recipe";
import { uid } from "@/lib/ids";
import { sessionStore } from "@/lib/storage";

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

/** Book-wide default treatment for recipe photos (cookbook mode):
    - `none` — no recipe photos anywhere;
    - `card` — a header photo inside each recipe card;
    - `full` — a full-page photo facing each recipe (image spread).
    The per-page layout picker overrides individual recipes on top of this. */
export type PhotoStyle = "none" | "card" | "full";

export interface ProjectMeta {
  cover?: CoverConfig;
  backCover?: CoverConfig;
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
  sections: Array<{ id: string; title?: string; photoUrl?: string; intro?: string; itemIds: string[] }>;
  /** Per-recipe cookbook page layout (full/half/image-spread), keyed by
      `QueueItem.id`. Kept out of the section list so the import/parse/queue
      lifecycle stays untouched by a book-only concern (see the type's comment).
      Absent/`full` = one card per sheet, i.e. today's behavior. */
  itemPlacements?: Record<string, RecipePagePlacement>;
}

const EMPTY_META: ProjectMeta = { sections: [] };

function readMeta(): ProjectMeta {
  const parsed = sessionStore.getJson<ProjectMeta>(PROJECT_META_STORAGE_KEY);
  // `sections` is the one field the rest of this module indexes into
  // unconditionally, so anything without it is treated as absent rather than
  // trusted and allowed to throw later.
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) return EMPTY_META;
  return parsed;
}

function writeMeta(meta: ProjectMeta) {
  // Survivable if it fails: meta stays correct in memory for this page.
  sessionStore.setJson(PROJECT_META_STORAGE_KEY, meta);
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
        photoUrl: section.photoUrl,
        intro: section.intro,
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
    photoUrl: section.photoUrl,
    intro: section.intro,
    itemIds: section.items.map((item) => item.id),
  }));
}

export function useProjectMeta() {
  const [meta, setMeta] = useState<ProjectMeta>(EMPTY_META);
  const [hydrated, setHydrated] = useState(false);
  const metaRef = useRef<ProjectMeta>(EMPTY_META);

  useEffect(() => {
    const initial = readMeta();
    metaRef.current = initial;
    setMeta(initial);
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
      const changed =
        current.sections.length !== nextSections.length ||
        current.sections.some((section, index) => {
          const next = nextSections[index];
          return (
            !next ||
            section.id !== next.id ||
            section.title !== next.title ||
            section.itemIds.length !== next.itemIds.length ||
            section.itemIds.some((id, i) => id !== next.itemIds[i])
          );
        });
      if (changed) commit({ ...current, sections: nextSections });
    },
    [commit],
  );

  const addSection = useCallback(
    (title?: string) => {
      const id = uid();
      update((current) => ({
        ...current,
        sections: [...current.sections, { id, title, itemIds: [] }],
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

  /** Chapter-opener photo for a section (cookbook mode). Empty/undefined clears it. */
  const setSectionPhoto = useCallback(
    (sectionId: string, photoUrl: string | undefined) => {
      update((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId ? { ...section, photoUrl: photoUrl || undefined } : section,
        ),
      }));
    },
    [update],
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

  /** Removes a section, merging its items into the neighboring section (the
      one before it, or the one after if it was first) so recipes are never
      lost — collapsing structure is exactly as safe as creating it. */
  const deleteSection = useCallback(
    (sectionId: string) => {
      update((current) => {
        const index = current.sections.findIndex((section) => section.id === sectionId);
        if (index === -1) return current;
        const target = current.sections[index];
        const neighborIndex = index > 0 ? index - 1 : index + 1;
        const sections = current.sections.slice();
        sections.splice(index, 1);
        const neighbor = sections[index > 0 ? neighborIndex - 1 : neighborIndex];
        if (neighbor) {
          neighbor.itemIds = [...neighbor.itemIds, ...target.itemIds];
        }
        return { ...current, sections };
      });
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

  /** Leaving cookbook mode strips every cookbook-only artifact — cover, back
      cover, chapters/dividers, table of contents, and per-recipe page layouts —
      back to a plain print job. The recipes themselves live in the queue and
      are untouched; clearing `sections` collapses them into one implicit
      untitled section (see `buildSections`). */
  const exitCookbook = useCallback(() => {
    commit({ sections: [] });
  }, [commit]);

  /** Sets (or, with `undefined`, clears back to the default `full`) a single
      recipe's cookbook page layout. Merges into the existing placement so a
      later heroImageUrl edit doesn't wipe the pageLayout and vice versa. */
  const setItemPlacement = useCallback(
    (itemId: string, placement: RecipePagePlacement | undefined) => {
      update((current) => {
        const next = { ...(current.itemPlacements ?? {}) };
        const merged = { ...next[itemId], ...placement };
        if (
          !placement ||
          (merged.pageLayout === undefined && merged.heroImageUrl === undefined)
        ) {
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
    setSectionIntro,
    deleteSection,
    moveItem,
    reorderSections,
    replaceSections,
    setCover,
    setBackCover,
    setTableOfContents,
    setTocKicker,
    setTocTitle,
    setSectionDividers,
    setCookbookMode,
    setCookbookPreset,
    exitCookbook,
    setItemPlacement,
    setItemPhotoMode,
    setPhotoStyle,
  };
}
