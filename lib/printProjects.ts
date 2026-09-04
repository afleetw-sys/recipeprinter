"use client";

import type {
  CoverConfig,
  PrintProject,
  PrintProjectContent,
  PrintProjectSettings,
  PrintProjectSummary,
  RecipePagePlacement,
  Section,
  StashedCookbook,
} from "@/types/recipe";
import { uid } from "@/lib/ids";
import { metaSectionsFromFull } from "@/lib/project";
import { localStore } from "@/lib/storage";
import {
  recipePrinterProjectPath,
  recipePrinterProjectsPath,
  recipePrinterUserPhotoRoot,
} from "@/lib/firebase/recipePrinterPaths";

const PRINT_PROJECTS_COLLECTION = "printProjects";

/** The subdocument holding the recipes. One per project; see `PrintProjectContent`. */
const CONTENT_DOC = ["content", "main"] as const;

/** Marks a legacy collection confirmed empty for a uid, so it is read once, not
    on every list. Sound because nothing writes that collection any more — it is
    only read and deleted from, so it can shrink and never grow. */
const LEGACY_EMPTY_KEY = "recipeprinter:legacy-projects-empty:v1";

function legacyKnownEmpty(ownerUid: string): boolean {
  return (localStore.get(LEGACY_EMPTY_KEY) ?? "").split(",").includes(ownerUid);
}

function rememberLegacyEmpty(ownerUid: string): void {
  if (legacyKnownEmpty(ownerUid)) return;
  const existing = (localStore.get(LEGACY_EMPTY_KEY) ?? "").split(",").filter(Boolean);
  localStore.set(LEGACY_EMPTY_KEY, [...existing, ownerUid].slice(-8).join(","));
}

/** Up to four recipe photos in book order — the projects grid's cover mosaic. */
function coverThumbsOf(sections: Section[]): string[] {
  const urls = sections.flatMap((section) => section.items.map((item) => item.recipe?.image));
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url)))).slice(0, 4);
}

function recipeCountOf(sections: Section[]): number {
  return sections.reduce((count, section) => count + section.items.length, 0);
}

/** Splits a project into the document that gets listed and the one that does not. */
function splitProject(project: PrintProject): { parent: Record<string, unknown>; content: PrintProjectContent } {
  const { sections, itemPlacements, stashedCookbook, ...rest } = project;
  return {
    parent: {
      ...rest,
      contentVersion: 2,
      sections: metaSectionsFromFull(sections),
      recipeCount: recipeCountOf(sections),
      coverThumbs: coverThumbsOf(sections),
    },
    content: { sections, itemPlacements, stashedCookbook },
  };
}

/** True for a document written before the split, which still carries its recipes inline. */
function isInlineDocument(data: Record<string, unknown>): boolean {
  if (data.contentVersion === 2) return false;
  const sections = data.sections;
  if (!Array.isArray(sections) || sections.length === 0) return true;
  return "items" in (sections[0] as Record<string, unknown>);
}

/**
 * The listed fields of a project held in full.
 *
 * For the device shelf, which stores whole `PrintProject`s in localStorage and
 * renders them through the same card as account projects — so the card can take
 * one shape rather than branching on where a book came from.
 */
export function summarizePrintProject(project: PrintProject): PrintProjectSummary {
  const sections = project.sections ?? [];
  return {
    id: project.id,
    kind: project.kind,
    revision: project.revision,
    ownerUid: project.ownerUid,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    recipeCount: recipeCountOf(sections),
    coverThumbs: coverThumbsOf(sections),
    sections: metaSectionsFromFull(sections),
    contentVersion: project.contentVersion,
  };
}

/** The listed fields, however the document happens to be stored. */
function summaryOf(data: Record<string, unknown>): PrintProjectSummary {
  if (!isInlineDocument(data)) return data as unknown as PrintProjectSummary;
  return { ...summarizePrintProject(data as unknown as PrintProject), contentVersion: 1 };
}

// Firestore's setDoc rejects a document containing an explicit `undefined`
// anywhere (unlike JSON.stringify, which just drops it) — a saved project has
// several optional fields (title, cover, backCover, book-only settings), so
// this needs the same recursive strip lib/sharedRecipeCards.ts already uses
// for the same reason.
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return value;
}

/**
 * Drops the parsed breakdown from any ingredient that already carries the whole
 * line.
 *
 * `ingredientText` prints `raw` when it exists and only composes a line from
 * amount/unit/name/note when it does not — so for an imported recipe those
 * parts are the same sentence stored a second time and never rendered. On a
 * representative 80-recipe cookbook that was 56KB of a 237KB document, about a
 * quarter of the headroom under Firestore's 1MiB per-document ceiling.
 *
 * Applied at the save boundary rather than on import, which means a book
 * written before this slims itself the next time it is saved. Nothing has to
 * migrate, and nothing is lost that anyone could see: a row keeps `raw` and
 * `section`, and `section` is grouping rather than a duplicate.
 */
export function slimIngredients(project: PrintProject): PrintProject {
  return {
    ...project,
    sections: project.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const recipe = item.recipe;
        if (!recipe?.ingredients?.length) return item;
        let changed = false;
        const ingredients = recipe.ingredients.map((ingredient) => {
          if (!ingredient.raw?.trim()) return ingredient;
          if (
            ingredient.amount === undefined &&
            ingredient.unit === undefined &&
            ingredient.name === undefined &&
            ingredient.note === undefined
          ) {
            return ingredient;
          }
          changed = true;
          return { raw: ingredient.raw, section: ingredient.section };
        });
        return changed ? { ...item, recipe: { ...recipe, ingredients } } : item;
      }),
    })),
  };
}

export function createPrintProjectId(): string {
  return uid();
}

/** Assembles a full `PrintProject` snapshot from the /print page's working
    state at the moment of saving — the one place the section/cover/title
    layer (lib/project.ts) and the device-local print-layout preferences
    (lib/printSettings.ts) actually get combined into the canonical document. */
export function assemblePrintProject(params: {
  id: string;
  ownerUid: string;
  title?: string;
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  dedication?: CoverConfig;
  frontMatter?: import("@/types/recipe").CookbookFrontMatter;
  settings: PrintProjectSettings;
  itemPlacements?: Record<string, RecipePagePlacement>;
  /** A book set aside by switching to recipe cards — see `StashedCookbook`.
      Persisted so "switch back to Cookbook" restores it after a reload, rather
      than finding no stash and scaffolding a fresh book over it. */
  stashedCookbook?: StashedCookbook;
  createdAt?: number;
  revision?: number;
  kind?: "cookbook" | "printProject";
}): PrintProject {
  const now = Date.now();
  return {
    id: params.id,
    kind: params.kind ?? (params.settings.cookbookMode ? "cookbook" : "printProject"),
    revision: params.revision ?? 0,
    ownerUid: params.ownerUid,
    title: params.title,
    sections: params.sections,
    cover: params.cover,
    backCover: params.backCover,
    dedication: params.dedication,
    frontMatter: params.frontMatter,
    settings: params.settings,
    itemPlacements: params.itemPlacements,
    stashedCookbook: params.stashedCookbook,
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  };
}

export class PrintProjectConflictError extends Error {
  constructor() {
    super("This project was updated somewhere else.");
    this.name = "PrintProjectConflictError";
  }
}

export async function savePrintProject(project: PrintProject): Promise<PrintProject> {
  if (!project.ownerUid) {
    throw new Error("Saving a project requires being signed in.");
  }
  const [{ doc, runTransaction }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const ref = doc(db, ...recipePrinterProjectPath(project.ownerUid, project.id));
  const contentRef = doc(db, ...recipePrinterProjectPath(project.ownerUid, project.id), ...CONTENT_DOC);
  const saved = await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    const remoteRevision = existing.exists()
      ? Number((existing.data() as Partial<PrintProject>).revision ?? 0)
      : 0;
    const expectedRevision = Number(project.revision ?? 0);
    if (existing.exists() && remoteRevision !== expectedRevision) {
      throw new PrintProjectConflictError();
    }
    const next = stripUndefined(slimIngredients({
      ...project,
      revision: remoteRevision + 1,
      createdAt: existing.exists()
        ? Number((existing.data() as Partial<PrintProject>).createdAt ?? project.createdAt)
        : project.createdAt,
      updatedAt: Date.now(),
      contentVersion: 2 as const,
    })) as PrintProject;
    // Two documents, one transaction. The parent is what the projects list
    // reads; the recipes are what makes it big. Splitting them is the whole
    // point, and doing it in one transaction is what keeps a saved book from
    // ever being half-written — a parent claiming 40 recipes with content from
    // an older save would be worse than either document alone.
    const { parent, content } = splitProject(next);
    transaction.set(ref, stripUndefined(parent));
    transaction.set(contentRef, stripUndefined(content));
    return next;
  });
  return saved;
}

/**
 * Every saved project, as much of one as a list needs.
 *
 * Replaced `loadPrintProjects`, which returned whole `PrintProject`s. Its only
 * two callers are the projects grid and the account menu, and between them they
 * used a title, a date, a recipe count and four thumbnails — so the old
 * signature had every saved cookbook downloaded in full, on page load and on
 * every avatar click. For documents written since the content split that is now
 * a ~1.7 kB read instead of ~151 kB; documents not yet re-saved still come down
 * whole and are summarized here, so nothing regresses while they migrate.
 */
export async function loadPrintProjectSummaries(ownerUid: string): Promise<PrintProjectSummary[]> {
  const [{ collection, getDocs, orderBy, query }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  // The legacy collection is read-only and delete-only — nothing has written it
  // since the namespace move — so it can shrink and never grow. One confirmed
  // empty read is therefore permanent, and skipping it halves this load for
  // every account that never had a project there.
  const skipLegacy = legacyKnownEmpty(ownerUid);
  const [namespaced, legacy] = await Promise.all([
    getDocs(query(collection(db, ...recipePrinterProjectsPath(ownerUid)), orderBy("updatedAt", "desc")))
      .catch(() => null),
    // Fault-isolated like the namespaced read: a transient error / rules change
    // on the legacy collection must not reject the whole load and make every
    // saved project appear to vanish — merge whichever half succeeded.
    skipLegacy
      ? Promise.resolve(null)
      : getDocs(query(collection(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION), orderBy("updatedAt", "desc")))
          .catch(() => null),
  ]);
  if (!skipLegacy && legacy && legacy.empty) rememberLegacyEmpty(ownerUid);
  // Fault isolation is for ONE half failing. When neither answered there is no
  // answer at all, and resolving `[]` here made that indistinguishable from an
  // account with nothing in it: the caller cached the empty list, the account
  // menu hid both sections, and someone with a shelf full of cookbooks was
  // shown a dropdown that quietly said they had none. Rejecting hands them the
  // "couldn't load / try again" both callers already know how to render.
  if (!namespaced && !(legacy || skipLegacy)) {
    throw new Error("Couldn't read saved projects.");
  }
  const byId = new Map<string, PrintProjectSummary>();
  legacy?.docs.forEach((snap) => byId.set(snap.id, summaryOf(snap.data())));
  namespaced?.docs.forEach((snap) => byId.set(snap.id, summaryOf(snap.data())));
  return Array.from(byId.values()).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
}

export async function loadPrintProject(ownerUid: string, projectId: string): Promise<PrintProject | null> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const snap = await getDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId))).catch(() => null);
  if (snap?.exists()) return hydrate(db, ownerUid, projectId, snap.data());
  // Temporary compatibility read. New writes are namespace-only.
  const legacy = await getDoc(doc(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId)).catch(() => null);
  return legacy?.exists() ? (legacy.data() as PrintProject) : null;
}

/**
 * Identity and revision for a saved project, without its recipes.
 *
 * The print page runs this on every signed-in load to answer "is my working
 * copy the same book as the one saved here, and at what revision" — and it was
 * calling `loadPrintProject`, whose own comment says the content is discarded.
 * That was up to a megabyte fetched for two integers, on the app's main screen,
 * every time it opened. Post-split the parent document *is* the answer, so this
 * reads one small document and stops.
 */
export async function loadPrintProjectHead(
  ownerUid: string,
  projectId: string,
): Promise<{ id: string; revision: number; createdAt?: number } | null> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const read = async (segments: readonly string[]) =>
    getDoc(doc(db, ...(segments as [string, ...string[]]))).catch(() => null);

  const snap = await read(recipePrinterProjectPath(ownerUid, projectId));
  const found =
    snap?.exists() ? snap : await read(["users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId]);
  if (!found?.exists()) return null;
  const data = found.data() as Partial<PrintProject>;
  return {
    id: String(data.id ?? projectId),
    revision: Number(data.revision ?? 0),
    createdAt: data.createdAt,
  };
}

/**
 * Rejoins a parent document with its recipes.
 *
 * A document written before the split still carries them inline and is returned
 * as-is, so a book saved months ago opens exactly as it did. One written since
 * needs its `content/main`; if that read fails the parent alone is not a usable
 * book — it has section ids and no recipes — so this throws rather than hand
 * back something that would autosave over the real content with nothing.
 */
async function hydrate(
  db: import("firebase/firestore").Firestore,
  ownerUid: string,
  projectId: string,
  data: Record<string, unknown>,
): Promise<PrintProject> {
  if (isInlineDocument(data)) return data as unknown as PrintProject;
  const { doc, getDoc } = await import("firebase/firestore");
  const contentSnap = await getDoc(
    doc(db, ...recipePrinterProjectPath(ownerUid, projectId), ...CONTENT_DOC),
  );
  if (!contentSnap.exists()) {
    throw new Error("This project's recipes could not be loaded.");
  }
  const content = contentSnap.data() as PrintProjectContent;
  const { recipeCount: _count, coverThumbs: _thumbs, ...parent } = data as Record<string, unknown>;
  return {
    ...(parent as unknown as PrintProject),
    sections: content.sections ?? [],
    itemPlacements: content.itemPlacements,
    stashedCookbook: content.stashedCookbook,
  };
}

export async function deletePrintProject(
  ownerUid: string,
  projectId: string,
  // Duplicate cleanup passes `keepAssets`. A forked copy only rewrites the
  // *anonymous* photo URLs it adopts, so books that were forked from an earlier
  // copy still point at that copy's `adopted/<id>/` folder — sweeping it while
  // deleting the older document would blank out the book being kept. Orphaned
  // photo objects are cheap; broken images in a kept cookbook are not.
  options: { keepAssets?: boolean } = {},
): Promise<void> {
  const [{ doc, deleteDoc }, { getDb }, { deleteObject, listAll, ref }, { getFirebaseStorage }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
    import("firebase/storage"),
    import("@/lib/firebase/storage"),
  ]);
  const db = getDb();
  const adoptedRoot = ref(
    getFirebaseStorage(),
    `${recipePrinterUserPhotoRoot(ownerUid)}/adopted/${projectId}`,
  );
  // Adopted anonymous images are copied under a project-owned prefix, so this
  // folder is safe to remove. User-wide uploads are intentionally retained:
  // another project or the recipe queue may still reference them.
  const removeFolder = async (folder: ReturnType<typeof ref>): Promise<void> => {
    const listed = await listAll(folder);
    await Promise.all([
      ...listed.items.map((item) => deleteObject(item)),
      ...listed.prefixes.map((prefix) => removeFolder(prefix)),
    ]);
  };
  if (!options.keepAssets) await removeFolder(adoptedRoot);
  // Compatibility reads merge the namespaced and legacy collections. Remove
  // both copies so an older project cannot reappear after deletion.
  //
  // The recipes go first. Deleting a document in Firestore does NOT delete its
  // subcollections, so a parent removed while `content/main` survived would
  // leave an orphan nothing can ever reach: the project no longer lists, and
  // the only path to that document runs through the parent id. Doing it in this
  // order means the worst interruption leaves a listed project whose recipes
  // failed to load, which is visible and retryable, rather than silent storage
  // nobody is billed for by accident.
  await deleteDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId), ...CONTENT_DOC)).catch(
    () => undefined,
  );
  await Promise.all([
    deleteDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId))),
    deleteDoc(doc(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId)),
  ]);
}


// Exported for tests. The split is the part of this module with no UI in front
// of it and the most to lose if it is wrong: a parent that disagrees with its
// content is a book that lists correctly and opens empty.
export const __splitForTest = splitProject;
export const __summaryOfForTest = summaryOf;
