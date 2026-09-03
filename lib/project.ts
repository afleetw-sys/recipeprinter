"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CookbookFrontMatter,
  CookbookPresetId,
  CoverConfig,
  QueueItem,
  RailSortMode,
  RecipePagePlacement,
  Section,
  SectionMeta,
  SectionPhotoMode,
  StashedCookbook,
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

/** The effective opener photo placement for a section. Explicit `photoMode`
    wins; otherwise a stored `photoUrl` means the legacy top-band photo
    (`band`), and failing both the opener FOLLOWS THE BOOK.
 *
 *  Chapter openers used to sit outside the book-wide Photos choice entirely: a
 *  book where every recipe faced a full-page photo still opened each chapter on
 *  a bare typographic page, and nothing in the UI explained why. So an opener
 *  with no choice of its own takes the book's:
 *    - `full` → `grid`, a collage of that chapter's own photos facing the
 *      opener. A single hero would just re-run the recipe pages' one-big-photo
 *      idea; a chapter is a group, and a group reads as a collage.
 *    - `card` → `band`, the photo inside the opener, matching the header photo
 *      each recipe card carries.
 *    - `none` → `none`.
 *  The book OUTRANKS a stored `photoUrl` (which only ever implied `band` for
 *  books saved before openers had a mode of their own) — otherwise a chapter
 *  with a photo could never follow a book that moved to full-page art. It does
 *  not outrank an explicit `photoMode`; changing the book-wide control clears
 *  those first (see `clearSectionPhotoModes`), so "follow the book" stays true
 *  without a placement the cook made becoming impossible to keep.
 *  Pass `bookPhotoStyle` wherever the book is known; omit it and the old
 *  photo-less default stands. Shared by the sheet builder and the pickers so
 *  the printed page and the dialog can never disagree. */
export function resolveSectionPhotoMode(
  section: {
    photoMode?: SectionPhotoMode;
    photoUrl?: string;
  },
  bookPhotoStyle?: PhotoStyle,
): SectionPhotoMode {
  if (section.photoMode) return section.photoMode;
  if (bookPhotoStyle === "full") return "grid";
  if (bookPhotoStyle === "card") return "band";
  if (bookPhotoStyle === "none") return "none";
  // No book to follow: a stored photo means the legacy top-band opener.
  return section.photoUrl ? "band" : "none";
}

/** How many of a chapter's own photos a collage starts with. A defaulted grid
    is a real selection, not a placeholder: the picker opens with exactly these
    tiles ticked, so "Select multiple" reads as something the cook could have
    done by hand — and could now undo one tile at a time. */
export const SECTION_GRID_DEFAULT_COUNT = 6;

/** The collage a chapter shows when nobody has curated one: its own recipes'
    photos, in book order, capped. The single source both the printed page and
    the picker read, so the page can never show a collage the dialog doesn't. */
export function defaultSectionGridImages(ownImages: readonly string[]): string[] {
  return ownImages.slice(0, SECTION_GRID_DEFAULT_COUNT);
}

export function recipePagePlacementHasValues(placement: RecipePagePlacement): boolean {
  return (
    placement.pageLayout !== undefined ||
    placement.heroImageUrl !== undefined ||
    placement.heroFocusX !== undefined ||
    placement.heroFocusY !== undefined ||
    placement.heroZoom !== undefined ||
    placement.showPhoto !== undefined ||
    (placement.photoHistory?.length ?? 0) > 0
  );
}

export interface ProjectMeta {
  /** Stable identity for purchase scoping and saved-project hydration. */
  projectId?: string;
  cover?: CoverConfig;
  /**
   * What this project is called in the app, as distinct from what is printed
   * on the cookbook's cover.
   *
   * Absent means "inherit" — see `projectDisplayTitle`. Most books want one
   * name in both places and get it for free; the two come apart when the cover
   * says "Recipes" in a decorative face and the shelf needs to say which of the
   * four books called Recipes this one is. Setting it here never touches the
   * cover, and a card job can have one even though it has no cover at all.
   */
  projectTitle?: string;
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
  /** Recipe order within each section — see `PrintProjectSettings.railSortMode`.
      Saved with the book, because "A-Z" keeps sorting as recipes arrive and it
      would be a different book tomorrow if the choice lived in the tab. */
  railSortMode?: RailSortMode;
  sectionDividers?: boolean;
  /** Opted into the cookbook experience (cover/sections) via "Make it a
      cookbook" — false/undefined means the plain print-cards UI. Gated off at
      the entry points for now; see COOKBOOK_ENABLED in lib/cookbookProduct.ts. */
  cookbookMode?: boolean;
  /** "New cookbook" was chosen from the library, but there are no recipes yet
      to make one from. Carries that choice through the add-recipes detour so
      the workspace opens as a book instead of dropping the cook into recipe
      cards and asking them to find the switch. Consumed on arrival. */
  cookbookIntent?: boolean;
  /** The print-format preset this cookbook exports at (trim/bleed/margin/gutter
      — see lib/cookbookPresets.ts). Absent = the default preset. Cookbook-only;
      cleared by `exitCookbook`. */
  cookbookPreset?: CookbookPresetId;
  /** Section metadata only (id/title/order/chapter-opener fields) — item ids,
      not recipe content. `photoUrl`/`intro` drive the cookbook chapter opener. */
  sections: SectionMeta[];
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
    projectTitle: cleanText(raw.projectTitle),
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

// How long a meta change may sit in memory before it reaches storage.
//
// Every text field in the cookbook — a chapter title, the cover title, the
// dedication, the TOC heading — writes through to this store on each keystroke,
// and each write used to mean TWO `JSON.stringify` of the entire project meta
// (once per storage area, via `setJson`) plus two SYNCHRONOUS storage writes, on
// the main thread, between one typed character and the next. Serializing once
// and coalescing the writes turns a per-character cost into a per-pause one.
//
// Deliberately a "schedule on first write, land on the timer" throttle rather
// than a resetting debounce: continuous typing must not be able to starve the
// write indefinitely, so nothing is ever more than this far from persisted. The
// window is short on purpose — this mirror is what protects an unsaved book
// from a tab close, and `flushMetaWrites` covers the orderly teardown paths
// exactly (see the hook's pagehide/visibilitychange effect).
const META_PERSIST_DEBOUNCE_MS = 250;

let pendingMetaJson: string | null = null;
let metaPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Writes any coalesced meta straight through. Safe to call when nothing is pending. */
function flushMetaWrites() {
  if (metaPersistTimer !== null) {
    clearTimeout(metaPersistTimer);
    metaPersistTimer = null;
  }
  const serialized = pendingMetaJson;
  pendingMetaJson = null;
  if (serialized === null) return;
  // Survivable if either fails: meta stays correct in memory for this page.
  sessionStore.set(PROJECT_META_STORAGE_KEY, serialized);
  // Mirror to the durable backup so book structure survives a tab close.
  localStore.set(PROJECT_META_RECOVERY_STORAGE_KEY, serialized);
}

function writeMeta(meta: ProjectMeta) {
  let serialized: string;
  try {
    serialized = JSON.stringify(meta);
  } catch {
    // Nothing persistable (circular structure / BigInt). In-memory meta is
    // still correct, matching what `setJson` did on a serialization failure.
    return;
  }
  pendingMetaJson = serialized;
  if (metaPersistTimer !== null) return;
  metaPersistTimer = setTimeout(flushMetaWrites, META_PERSIST_DEBOUNCE_MS);
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
 * Moves one or more items into `toSectionId` as a single block, in the order
 * given. `toIndex` counts within the destination AFTER every moved id has been
 * pulled out of it — the list the rail measures its drop against. Pure; the
 * hook's `moveItems` wraps this. Exported for testing.
 */
export function moveItemsInMeta(
  meta: ProjectMeta,
  itemIds: string[],
  toSectionId: string,
  toIndex: number,
): ProjectMeta {
  const moving = new Set(itemIds);
  const ordered = itemIds.filter((id, index) => itemIds.indexOf(id) === index);
  const sections = meta.sections.map((section) => ({
    ...section,
    itemIds: section.itemIds.filter((id) => !moving.has(id)),
  }));
  const target = sections.find((section) => section.id === toSectionId);
  if (!target) return meta;
  const clampedIndex = Math.max(0, Math.min(toIndex, target.itemIds.length));
  target.itemIds.splice(clampedIndex, 0, ...ordered);
  return { ...meta, sections };
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

/**
 * What to call this project on screen.
 *
 * One name, resolved in order of how deliberate it was: an explicit rename
 * first, then the cookbook's cover, then the book set aside behind a card job,
 * then the first recipe in it, and only then a generic label. The recipe
 * fallback matters more than it looks — "Banana Bread + 2 more" is findable in
 * a shelf of forty; "Recipe cards" is not, and four projects called that are
 * indistinguishable.
 */
export function projectDisplayTitle(
  meta: Pick<ProjectMeta, "projectTitle" | "cover" | "stashedCookbook" | "cookbookMode">,
  firstRecipeTitle?: string,
  extraCount = 0,
): string {
  const explicit = meta.projectTitle?.trim();
  if (explicit) return explicit;
  const cover = meta.cover?.title?.trim() || meta.stashedCookbook?.cover?.title?.trim();
  if (cover) return cover;
  const recipe = firstRecipeTitle?.trim();
  if (recipe) return extraCount > 0 ? `${recipe} + ${extraCount} more` : recipe;
  return meta.cookbookMode ? "Untitled cookbook" : "Recipe cards";
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

  // Meta writes are coalesced (see `META_PERSIST_DEBOUNCE_MS`), so the last few
  // hundred milliseconds of edits can still be in memory when the tab goes
  // away. `pagehide` is the reliable teardown signal (close, navigation, and
  // mobile bfcache freeze); `visibilitychange` → hidden covers backgrounding the
  // app, which on mobile is often the last callback before the page is
  // discarded. Same pair the print page uses to flush its Firestore save — this
  // one protects the local recovery mirror, which is the safety net underneath it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushMetaWrites();
    };
    window.addEventListener("pagehide", flushMetaWrites);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushMetaWrites);
      document.removeEventListener("visibilitychange", onVisibility);
      // Unmounting is itself a teardown — don't strand a pending write.
      flushMetaWrites();
    };
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

  /** Moves one or more items as a single block — what a drag of a rail
      multi-select commits. Moving the ids one at a time instead would insert
      each against a list still holding its siblings, so a selection dragged
      past its own members would land scattered (see `moveItemsInMeta`). */
  const moveItems = useCallback(
    (itemIds: string[], toSectionId: string, toIndex: number) => {
      update((current) => moveItemsInMeta(current, itemIds, toSectionId, toIndex));
    },
    [update],
  );

  const moveItem = useCallback(
    (itemId: string, toSectionId: string, toIndex: number) => moveItems([itemId], toSectionId, toIndex),
    [moveItems],
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

  const setRailSortMode = useCallback(
    (value: RailSortMode) => {
      // "custom" is the absence of a choice, so it is stored as absence — that
      // keeps a hand-arranged book's document identical to every one saved
      // before this setting existed.
      update((current) => ({ ...current, railSortMode: value === "custom" ? undefined : value }));
    },
    [update],
  );

  const setTocTitle = useCallback(
    (value: string | undefined) => {
      update((current) => ({ ...current, tocTitle: value || undefined }));
    },
    [update],
  );

  /** Renames the project without touching the cookbook's printed cover.
      Clearing it (empty string) puts the name back to inheriting. */
  const setProjectTitle = useCallback(
    (value: string | undefined) => {
      update((current) => ({ ...current, projectTitle: value?.trim() || undefined }));
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
        railSortMode: current.railSortMode,
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
  /** Drops every opener's explicit photo placement so chapter openers fall back
      to following the book (see `resolveSectionPhotoMode`). The art itself —
      a chosen photo, a curated collage — is KEPT, so the new placement uses it
      straight away and switching back restores exactly what was there. */
  const clearSectionPhotoModes = useCallback(() => {
    update((current) => {
      if (!current.sections.some((section) => section.photoMode)) return current;
      return {
        ...current,
        sections: current.sections.map((section) => {
          if (!section.photoMode) return section;
          const next = { ...section };
          delete next.photoMode;
          return next;
        }),
      };
    });
  }, [update]);

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
        if (placement.heroZoom !== undefined) kept.heroZoom = placement.heroZoom;
        if (recipePagePlacementHasValues(kept)) next[id] = kept;
      }
      return { ...current, itemPlacements: next };
    });
  }, [update]);

  /**
   * Starts a genuinely new project: fresh id, no cookbook, no sections, no stash.
   *
   * Clearing the recipe list used to leave the project IDENTITY in place, and
   * the identity is what autosave writes to. So emptying the queue and adding
   * different recipes did not start something new — it replaced the contents of
   * the saved cookbook the id still pointed at, with no prompt and no undo. It
   * is also why there was no way to make a SECOND cookbook: the only entry point
   * returned you to the one that id already owned.
   *
   * Nothing saved is destroyed. The previous project keeps its own id, its own
   * document, and its own purchase, and stays in the library — this just stops
   * pointing at it.
   */
  const startNewProject = useCallback(
    (options: { cookbook?: boolean } = {}) => {
      commit({
        ...EMPTY_META,
        projectId: uid(),
        cookbookIntent: options.cookbook || undefined,
        // Whether the cookbook pitch has been seen is a fact about the PERSON,
        // not the project. Resetting it per project would re-pitch the product
        // to someone already on their second book.
        cookbookWelcomeCompleted: metaRef.current.cookbookWelcomeCompleted,
      });
    },
    [commit],
  );

  /** Consumes the "make this a cookbook" choice carried from the library, so it
      fires exactly once and a later visit doesn't re-scaffold. */
  const clearCookbookIntent = useCallback(() => {
    update((current) =>
      current.cookbookIntent ? { ...current, cookbookIntent: undefined } : current,
    );
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
    setSectionPhotoMode,
    setSectionIntro,
    updateSection,
    deleteSection,
    moveItem,
    moveItems,
    reorderSections,
    setSectionStructure,
    setCover,
    setBackCover,
    setDedication,
    setFrontMatter,
    setCookbookWelcomeCompleted,
    setTableOfContents,
    setTocKicker,
    setRailSortMode,
    setTocTitle,
    setProjectTitle,
    setSectionDividers,
    setCookbookMode,
    setCookbookPreset,
    exitCookbook,
    restoreCookbook,
    setItemPlacement,
    setItemPhotoMode,
    clearItemPhotoOverrides,
    clearSectionPhotoModes,
    setPhotoStyle,
    startNewProject,
    clearCookbookIntent,
    replaceMeta,
    setProjectId,
  };
}
