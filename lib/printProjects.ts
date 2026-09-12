"use client";

import type {
  CookbookFrontMatter,
  CoverConfig,
  PrintCardSize,
  PrintProject,
  PrintProjectContent,
  PrintProjectSettings,
  PrintProjectSummary,
  RecipePagePlacement,
  RecipePrintTemplate,
  Section,
  StashedCookbook,
} from "@/types/recipe";
import { uid } from "@/lib/ids";
import { metaSectionsFromFull, type ProjectMeta } from "@/lib/project";
import {
  LEGACY_PROJECTS_EMPTY_KEY,
  legacyKnownEmpty,
  rememberLegacyEmpty,
} from "@/lib/legacyCollections";
import { stripUndefined } from "@/lib/firebase/stripUndefined";
import {
  recipePrinterProjectPath,
  recipePrinterProjectsPath,
  recipePrinterUserPhotoRoot,
} from "@/lib/firebase/recipePrinterPaths";

const PRINT_PROJECTS_COLLECTION = "printProjects";

/** The subdocument holding the recipes. One per project; see `PrintProjectContent`. */
const CONTENT_DOC = ["content", "main"] as const;

/** Whether this account's pre-namespace project collection is known empty, so
    the compatibility reads below can be skipped rather than paid for. Lifted
    into lib/legacyCollections so the unlock reads share the same reasoning. */
function legacyProjectsKnownEmpty(ownerUid: string): boolean {
  return legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, ownerUid);
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

export interface AssembleProjectParams {
  id: string;
  ownerUid: string;
  title?: string;
  /** A name the cook typed. Carried through so a rename survives being saved
      and reopened — see `PrintProject.projectTitle`. */
  projectTitle?: string;
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  dedication?: CoverConfig;
  frontMatter?: CookbookFrontMatter;
  settings: PrintProjectSettings;
  itemPlacements?: Record<string, RecipePagePlacement>;
  /** A book set aside by switching to recipe cards — see `StashedCookbook`.
      Persisted so "switch back to Cookbook" restores it after a reload, rather
      than finding no stash and scaffolding a fresh book over it. */
  stashedCookbook?: StashedCookbook;
  createdAt?: number;
  revision?: number;
  kind?: "cookbook" | "printProject";
}

/**
 * The print-layout half of a project's settings: what the cook has set up on
 * screen, or — filing from outside the workspace, where there is no live state
 * to read — whatever their stored device preferences say.
 *
 * The half that does NOT come from the book's own metadata, which is the line
 * `projectContentFromMeta` draws.
 */
export interface PrintLayoutSettings {
  cardSize: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  showPhoto: boolean;
  showSourceUrl: boolean;
  /** Per-project rather than a device preference, so absent when filing from
      outside the workspace — `writePrintSettings` has never stored it. */
  showDescription?: boolean;
  showCutLines: boolean;
}

/**
 * Everything a saved project takes from the working copy's metadata.
 *
 * Three places built this by hand: the account save and the PDF export on the
 * print page, and `fileProjectLocally` on the way out of the workspace. They
 * were written to agree — `fileProjectLocally` said so, "the same rule
 * `currentProject` applies on the print page" — and they did not: the device
 * shelf dropped `railSortMode`, so a book filed on the way out and reopened
 * later came back having forgotten it was sorted A-Z.
 *
 * A book set aside is still a book, which is the rule all three need and the
 * one most easily got wrong. "Print as recipe cards instead" moves the cover,
 * chapters and front matter into `stashedCookbook` and leaves `meta` almost
 * empty — and the autosave that followed wrote that emptiness straight over the
 * saved document. A purchased cookbook came back as `kind: "printProject"`,
 * renamed after whichever recipe happened to be first, with its cover and
 * dedication deleted from the record. So the stash counts as proof of what this
 * document IS, and supplies the fields the live meta no longer has.
 * `settings.cookbookMode` still tracks the live view, so reopening lands the
 * cook back in recipe cards where they left off — the DOCUMENT is a cookbook,
 * the VIEW is cards.
 *
 * What each caller still owns is what genuinely differs: which document this is
 * (`id`, `ownerUid`, `revision`), what is in it (`sections`), and what it is
 * called — the workspace derives a title from the cook's name for the project,
 * the shelf from the recipes, and neither answer suits the other.
 */
export function projectContentFromMeta(
  meta: ProjectMeta,
  layout: PrintLayoutSettings,
): Pick<
  AssembleProjectParams,
  | "projectTitle"
  | "cover"
  | "backCover"
  | "dedication"
  | "frontMatter"
  | "kind"
  | "settings"
  | "itemPlacements"
  | "stashedCookbook"
> {
  const stash = meta.stashedCookbook;
  return {
    // Saved beside the resolved title so a reopened project can tell a rename
    // from a cover name. Folding the two together would force a choice between
    // losing the rename and having cover edits stop renaming the project.
    projectTitle: meta.projectTitle,
    cover: meta.cover ?? stash?.cover,
    backCover: meta.backCover ?? stash?.backCover,
    dedication: meta.dedication ?? stash?.dedication,
    frontMatter: meta.frontMatter ?? stash?.frontMatter,
    kind: meta.cookbookMode || meta.stashedCookbook ? "cookbook" : "printProject",
    settings: {
      ...layout,
      cookbookMode: meta.cookbookMode,
      tableOfContents: meta.tableOfContents,
      sectionDividers: meta.sectionDividers,
      bookPreset: meta.cookbookPreset,
      cookbookWelcomeCompleted: meta.cookbookWelcomeCompleted,
      tocKicker: meta.tocKicker,
      tocTitle: meta.tocTitle,
      photoStyle: meta.photoStyle,
      railSortMode: meta.railSortMode,
    },
    itemPlacements: meta.itemPlacements,
    stashedCookbook: meta.stashedCookbook,
  };
}

/** Assembles a full `PrintProject` snapshot from the /print page's working
    state at the moment of saving — the one place the section/cover/title
    layer (lib/project.ts) and the device-local print-layout preferences
    (lib/printSettings.ts) actually get combined into the canonical document. */
export function assemblePrintProject(params: AssembleProjectParams): PrintProject {
  const now = Date.now();
  return {
    id: params.id,
    kind: params.kind ?? (params.settings.cookbookMode ? "cookbook" : "printProject"),
    revision: params.revision ?? 0,
    ownerUid: params.ownerUid,
    title: params.title,
    projectTitle: params.projectTitle,
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

/* ── Skipping the content write when the recipes did not change ──────────────
   A save writes two documents: the small parent the projects list reads, and
   `content/main`, which holds every recipe and is the one with real size to it
   (see `loadPrintProjectSummaries` — ~151 kB against ~1.7 kB on a modest book,
   and the ceiling is Firestore's 1 MiB).

   Autosave fires 1.5s after any settled edit, and most edits are not recipes:
   a duplex checkbox, the book's title, a cover photo, the contents toggle, a
   print preset. Every one of those used to re-upload the entire book to store
   a change that lives wholly in the parent. On a large cookbook an editing
   session was dozens of half-megabyte uploads, which is felt on a phone.

   What makes it safe to skip is that BOTH halves of the key have to match:

     revision  — the parent revision this tab last wrote. If anything else has
                 written the project since, the revision has moved and we write
                 the content again. This is what covers the dangerous case:
                 `resolveConflictByOverwriting` re-reads the remote revision and
                 saves on top of another tab's content, so "unchanged since MY
                 last write" is not "unchanged in the document".
     signature — of the exact object we would have written.

   Errors fall the safe way. A signature that disagrees when the content is
   really identical costs one redundant write, which is what happened on every
   save before this. A signature that agrees requires the serialized content to
   be byte-identical, which is the thing being asserted.

   Session-scoped on purpose: a tab that has not written this project has no
   idea what is in the document and always writes. */

interface LastContentWrite {
  /** The parent revision that write produced. */
  revision: number;
  signature: string;
}

const lastContentWrites = new Map<string, LastContentWrite>();

function contentWriteKey(ownerUid: string, projectId: string): string {
  return `${ownerUid}/${projectId}`;
}

/**
 * A short, collision-resistant stand-in for the serialized content document.
 *
 * The full string is the obvious thing to keep and the wrong one: it is up to a
 * megabyte, the print page already retains a whole-book fingerprint of its own
 * (`lastSavedFingerprintRef`), and a second full copy per open project is real
 * memory on the device least able to spare it.
 *
 * Length plus two independently-seeded FNV-1a passes. Two different books
 * colliding would have to agree on all three, and a collision is the one error
 * here that loses a write — hence not a single 32-bit hash.
 */
function contentSignature(content: unknown): string {
  const serialized = JSON.stringify(content) ?? "";
  let a = 2166136261;
  let b = 754639011;
  for (let i = 0; i < serialized.length; i += 1) {
    const code = serialized.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b ^ (code + i), 2246822519);
  }
  return `${serialized.length}.${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
}

/** Forgets what this tab knows about a project's stored content, so the next
    save writes it in full. Called wherever the document stops being ours to
    reason about — chiefly deletion. */
function forgetContentWrite(ownerUid: string, projectId: string): void {
  lastContentWrites.delete(contentWriteKey(ownerUid, projectId));
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
  const writeKey = contentWriteKey(project.ownerUid, project.id);
  const committed = await runTransaction(db, async (transaction) => {
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

    // …and the recipes only when they are not already there. See
    // `lastContentWrites`: a match means THIS tab wrote this exact content at
    // the revision the document still carries, so the write would be a
    // half-megabyte restatement of what is in front of it.
    const strippedContent = stripUndefined(content);
    const signature = contentSignature(strippedContent);
    const lastWrite = lastContentWrites.get(writeKey);
    const contentAlreadyStored =
      lastWrite !== undefined &&
      lastWrite.revision === remoteRevision &&
      lastWrite.signature === signature;
    if (!contentAlreadyStored) transaction.set(contentRef, strippedContent);

    return { project: next, signature };
  });

  // Recorded out here rather than inside the callback: Firestore re-runs a
  // transaction body on contention, and a retry must not leave this Map
  // claiming a write that was rolled back.
  lastContentWrites.set(writeKey, {
    revision: Number(committed.project.revision ?? 0),
    signature: committed.signature,
  });
  return committed.project;
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
  const skipLegacy = legacyProjectsKnownEmpty(ownerUid);
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
  if (!skipLegacy && legacy && legacy.empty) rememberLegacyEmpty(LEGACY_PROJECTS_EMPTY_KEY, ownerUid);
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

/**
 * A whole saved project: the listed parent, rejoined with its recipes.
 *
 * The two reads go out TOGETHER, which is the difference between one round trip
 * and two on the screen a cook actually waits at. Where `content/main` lives is
 * decided entirely by `(ownerUid, projectId)` — the parent is never consulted
 * to find it, only to decide whether it is needed — so there is nothing to wait
 * for before asking for it.
 *
 * The parent still decides what the answer means. A document written before the
 * content split carries its recipes inline and ignores the second read; so does
 * a projectId with nothing behind it. Both pay one extra read of a document
 * that isn't there, which Firestore bills like one that is. That is the trade,
 * and it is worth taking: inline documents re-save themselves into the split
 * shape the first time they are touched, so that cost is shrinking, and the
 * round trip it buys back is paid on every open of every modern book.
 *
 * `null` means the account genuinely has no such project, and NOTHING ELSE. A
 * read that could not be made throws.
 *
 * That distinction is load-bearing, and it used to be thrown away: both reads
 * carried `.catch(() => null)`, so being offline, or a rules deploy, or a
 * dropped connection all answered "there is no such book" — indistinguishable
 * from the truth. The caller believes that answer and acts on it. On /print it
 * falls back to this device's shelf copy and, because a shelved book is by
 * definition one the account does not hold yet, immediately writes it up
 * through `adoptAnonymousProject` — which reads the remote revision rather than
 * checking it, so it cannot conflict. One failed read on a phone therefore
 * replaced a book edited on a laptop with whatever this device last filed.
 *
 * A missing document does not throw in Firestore: `getDoc` resolves with
 * `exists() === false`. So letting an error through costs nothing in the normal
 * case and is the only way to say "I don't know" out loud.
 */
export async function loadPrintProject(ownerUid: string, projectId: string): Promise<PrintProject | null> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const projectPath = recipePrinterProjectPath(ownerUid, projectId);
  const [snap, contentSnap] = await Promise.all([
    getDoc(doc(db, ...projectPath)),
    // The ONE read still allowed to fail quietly, because `hydrate` decides
    // what its absence means: an inline document does not need it, and a split
    // one throws rather than hand back a book with no recipes in it. Either way
    // the parent has already been read successfully, so "I don't know" is still
    // said — by the throw, not by a null.
    getDoc(doc(db, ...projectPath, ...CONTENT_DOC)).catch(() => null),
  ]);
  if (snap.exists()) return hydrate(snap.data(), contentSnap);
  // Temporary compatibility read. New writes are namespace-only, and once the
  // legacy collection has been seen empty for this account there is nothing
  // there to find — see `legacyProjectsKnownEmpty`.
  if (legacyProjectsKnownEmpty(ownerUid)) return null;
  const legacy = await getDoc(doc(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId));
  return legacy.exists() ? (legacy.data() as PrintProject) : null;
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

  // Both at once, not one after the other.
  //
  // This runs on every signed-in load of /print, and for a working copy that
  // has never been saved BOTH reads miss — which was two sequential round trips
  // on the app's main screen before it could even decide there was nothing to
  // attach to. Firing them together makes the miss cost one round trip instead
  // of two, and where the legacy collection is already known empty it costs
  // none at all.
  const skipLegacy = legacyProjectsKnownEmpty(ownerUid);
  const [snap, legacy] = await Promise.all([
    read(recipePrinterProjectPath(ownerUid, projectId)),
    skipLegacy ? Promise.resolve(null) : read(["users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId]),
  ]);
  const found = snap?.exists() ? snap : legacy;
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
 *
 * `contentSnap` is handed in already read (see `loadPrintProject`) rather than
 * fetched here, which is what lets the two reads overlap. `null` covers both
 * ways there can be no content to join — the read failed, or the document is
 * genuinely absent — and both end here the same way they always did, in a
 * throw, because the parent alone is not a book either way.
 */
function hydrate(
  data: Record<string, unknown>,
  contentSnap: import("firebase/firestore").DocumentSnapshot | null,
): PrintProject {
  if (isInlineDocument(data)) return data as unknown as PrintProject;
  if (!contentSnap?.exists()) {
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
  // Before anything is removed. What this tab believed about the stored content
  // stops being true the moment the documents go, and a save that raced the
  // delete must write in full rather than trust it.
  forgetContentWrite(ownerUid, projectId);
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
  //
  // Its failure is NOT swallowed, which it used to be — the parent was then
  // removed anyway, producing exactly the unreachable orphan the ordering is
  // here to avoid. Deleting a document that was never there succeeds in
  // Firestore, so an inline project with no content subdocument still passes
  // straight through this.
  await deleteDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId), ...CONTENT_DOC));
  await Promise.all([
    deleteDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId))),
    // Deleting a document that was never there is still a billed write, and the
    // duplicate sweeper deletes in bulk. Skipped where the legacy collection is
    // known empty for this account.
    legacyProjectsKnownEmpty(ownerUid)
      ? Promise.resolve()
      : deleteDoc(doc(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId)),
  ]);
}


// Exported for tests. The split is the part of this module with no UI in front
// of it and the most to lose if it is wrong: a parent that disagrees with its
// content is a book that lists correctly and opens empty.
export const __splitForTest = splitProject;
export const __summaryOfForTest = summaryOf;
