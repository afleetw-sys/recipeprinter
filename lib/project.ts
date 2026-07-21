"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoverConfig, QueueItem, Section } from "@/types/recipe";

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

export interface ProjectMeta {
  cover?: CoverConfig;
  backCover?: CoverConfig;
  /** Reserved. No TOC page exists yet, so nothing reads this and the settings
      panel no longer offers a toggle for it (see renderPrintSettingsFields).
      Kept in the shape — rather than dropped and re-added later — so projects
      saved while the toggle existed still round-trip unchanged. */
  tableOfContents?: boolean;
  sectionDividers?: boolean;
  /** Opted into the cookbook experience (cover/sections) via "Make it a
      cookbook" — false/undefined means the plain print-cards UI. Gated off at
      the entry points for now; see COOKBOOK_ENABLED in lib/cookbookProduct.ts. */
  cookbookMode?: boolean;
  /** Section metadata only (id/title/order) — item ids, not recipe content. */
  sections: Array<{ id: string; title?: string; itemIds: string[] }>;
}

const EMPTY_META: ProjectMeta = { sections: [] };

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readMeta(): ProjectMeta {
  if (typeof window === "undefined") return EMPTY_META;
  try {
    const raw = window.sessionStorage.getItem(PROJECT_META_STORAGE_KEY);
    if (!raw) return EMPTY_META;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) return EMPTY_META;
    return parsed as ProjectMeta;
  } catch {
    return EMPTY_META;
  }
}

function writeMeta(meta: ProjectMeta) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PROJECT_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* sessionStorage may be unavailable (private mode); meta stays in memory */
  }
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
      return { id: section.id, title: section.title, items: sectionItems };
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

  const setCookbookMode = useCallback(
    (value: boolean) => {
      update((current) => ({ ...current, cookbookMode: value }));
    },
    [update],
  );

  return {
    meta,
    hydrated,
    syncSections,
    addSection,
    renameSection,
    deleteSection,
    moveItem,
    reorderSections,
    setCover,
    setBackCover,
    setTableOfContents,
    setSectionDividers,
    setCookbookMode,
  };
}
