"use client";

import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { PrintProject, QueueItem } from "@/types/recipe";
import { localStore } from "@/lib/storage";
import { buildSections, type ProjectMeta } from "@/lib/project";
import { assemblePrintProject } from "@/lib/printProjects";
// The storage-only half of print settings, deliberately NOT "@/lib/printSettings"
// — that module's validators pull in the whole printable-card component tree,
// and this one runs on the homepage. See lib/printSettingsStore.
import { readPrintSettings } from "@/lib/printSettingsStore";
import { uid } from "@/lib/ids";
import { lookupProjectId, projectContentKey, rememberProjectId } from "@/lib/projectIdentity";
import { isCookbookProjectUnlocked } from "@/lib/cookbookUnlocks";

/**
 * Cookbooks kept on this device.
 *
 * A cookbook belonging to a signed-in cook autosaves to their account, and the
 * account is where it lives. A cookbook built while signed out had nowhere at
 * all — it existed only as the live working copy in `lib/queue` +
 * `lib/project`, which the homepage releases the moment you go back there. So
 * "I made a book, went to add another recipe, and my book was gone" was the
 * expected behaviour, and for someone who had *bought* that book it was the
 * expected behaviour after paying for it.
 *
 * This is the shelf that was missing. Releasing the working copy now writes the
 * document here first, so leaving the workspace files the book rather than
 * discarding it, and `/projects` can list it beside the account's own — signed
 * in or out.
 *
 * The stored value is a real `PrintProject`, byte-identical to what
 * `savePrintProject` sends to Firestore (both are built by
 * `assemblePrintProject`), so a local book and an account book are the same
 * kind of thing everywhere downstream and nothing has to special-case which
 * shelf one came off.
 *
 * This is a shelf, not a sync engine: the account copy always wins. Once a
 * project id shows up in the account's own list, the local copy of it is
 * redundant and gets swept (see `pruneLocalProjects`).
 */

const LOCAL_PROJECTS_KEY = "recipeprinter:local-projects:v1";

/**
 * How many projects this shelf holds before the oldest falls off.
 *
 * Photos are Storage URLs rather than base64 (see lib/photoStorage.ts), so a
 * project is essentially its text — a recipe measures about 4.6 KB — and this
 * many sits well inside any browser's ~5 MB origin budget.
 *
 * Raised from twelve when the shelf stopped being books-only. Twelve was
 * generous for cookbooks, which people make deliberately and rarely; it is a
 * fortnight for card printing, which happens whenever someone cooks. The cap
 * exists so a store written on every exit cannot grow without limit across a
 * long life on one device, not because a realistic number would strain it.
 */
export const MAX_LOCAL_PROJECTS = 40;

type LocalProjectMap = Record<string, PrintProject>;

/* The shelf holds up to MAX_LOCAL_PROJECTS whole `PrintProject`s with their
   recipes inline, so the stored value runs to megabytes — and every read used
   to `JSON.parse` all of it. `/projects` alone does that three times per load
   (initial, after the account read, after the prune), and filing a project on
   the way out parses the lot, sorts it, and re-serializes the lot.

   Cached on the RAW STRING rather than on a dirty flag. Reading the string back
   is cheap next to parsing it, and comparing it means a shelf changed in
   another tab invalidates this one for free — a flag would happily serve that
   tab's stale copy. */
let cachedRaw: string | null = null;
let cachedMap: LocalProjectMap | null = null;

function readAll(): LocalProjectMap {
  const raw = localStore.get(LOCAL_PROJECTS_KEY);
  if (raw === null) {
    cachedRaw = null;
    cachedMap = null;
    return {};
  }
  if (raw === cachedRaw && cachedMap) return cachedMap;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  cachedRaw = raw;
  cachedMap = parsed as LocalProjectMap;
  return cachedMap;
}

/** A copy safe to mutate. `readAll` hands back the cached object itself, and
    editing that in place would corrupt what every other reader sees. */
function readAllForEdit(): LocalProjectMap {
  return { ...readAll() };
}

function writeAll(map: LocalProjectMap): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(map);
  } catch {
    return false;
  }
  const stored = localStore.set(LOCAL_PROJECTS_KEY, serialized);
  // Seed the cache from what we just wrote, so the read that almost always
  // follows a write costs nothing. Only on success — a refused write (private
  // mode, quota) leaves the stored value as it was, and claiming otherwise
  // would serve a shelf that is not on disk.
  if (stored) {
    cachedRaw = serialized;
    cachedMap = map;
  }
  return stored;
}

/** Most recently updated first — the order `/projects` renders them in. */
function byNewest(projects: PrintProject[]): PrintProject[] {
  return [...projects].sort(
    (a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0),
  );
}

/**
 * Files a project on this device.
 *
 * This used to accept documents only — a cookbook, or a card job with a book
 * stashed beside it — on the reasoning that nobody named a plain print job,
 * nobody asked to keep it, and shelving every Tuesday's dinner would turn the
 * library into a log.
 *
 * That reasoning has been overtaken. Leaving the workspace now clears the desk
 * for a genuinely new project, so a card job that isn't filed is a card job
 * that is destroyed — and the recipes someone just imported, corrected and
 * arranged are worth more than a tidy library. The log objection is answered
 * where it actually lands: the shelf is capped, and the recipe content behind
 * these projects is deduplicated rather than copied per session.
 *
 * Returns whether anything was stored, so callers that clear the working copy
 * afterwards can tell a filed project from one that could not be written
 * (private mode, quota) — the difference between releasing a copy and losing
 * one.
 */
export function saveLocalProject(project: PrintProject): boolean {
  if (!project.id) return false;

  const map = readAllForEdit();
  map[project.id] = project;

  const kept = byNewest(Object.values(map)).slice(0, MAX_LOCAL_PROJECTS);
  const next: LocalProjectMap = {};
  for (const entry of kept) next[entry.id] = entry;

  // The book we were just asked to file must be one of the survivors — if the
  // cap evicted it, it was already the oldest of MAX_LOCAL_PROJECTS, and saying
  // "filed" would be a lie the caller then acts on by clearing the original.
  if (!next[project.id]) return false;

  return writeAll(next);
}

export function loadLocalProjects(): PrintProject[] {
  return byNewest(Object.values(readAll()));
}

/**
 * Every locally-held photo the shelf is still pointing at.
 *
 * A Paprika photo lives in IndexedDB and the recipe carries only its id
 * (`QueueItem.localPhotoId`), so a project filed here is a REFERENCE to those
 * bytes, not a copy of them — the stored `recipe.image` is an object URL that
 * died with the document that minted it, and `rehydrateLocalPhotos` mints a
 * fresh one from the store on the way back in.
 *
 * Which makes the shelf an owner, and the queue has to ask it before dropping
 * a photo. Leaving the workspace files the project and THEN clears the queue,
 * one after the other in the same breath — so clearing used to delete the exact
 * bytes the book it had just filed was relying on, and that book could never
 * show its photos again. See `releaseLocalPhotos` in lib/queue.ts.
 */
export function localProjectPhotoIds(): Set<string> {
  const ids = new Set<string>();
  for (const project of Object.values(readAll())) {
    for (const section of project.sections ?? []) {
      for (const item of section.items ?? []) {
        if (item.localPhotoId) ids.add(item.localPhotoId);
      }
    }
  }
  return ids;
}

export function loadLocalProject(projectId: string): PrintProject | null {
  return readAll()[projectId] ?? null;
}

export function deleteLocalProject(projectId: string): void {
  const map = readAllForEdit();
  if (!map[projectId]) return;
  delete map[projectId];
  writeAll(map);
}

/**
 * Drops local copies of books the account already holds.
 *
 * Called after a successful read of the account's own projects — never after a
 * failed one, which is the absence of an answer rather than proof the account
 * has the book. Mirrors the reasoning in `loadCookbookProjectUnlock`: a network
 * failure must not be allowed to delete anything.
 */
export function pruneLocalProjects(accountProjectIds: readonly string[]): void {
  const map = readAllForEdit();
  let changed = false;
  for (const id of accountProjectIds) {
    if (map[id]) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeAll(map);
}

/**
 * Files the live working copy — the queue plus its project metadata — onto
 * this device's shelf.
 *
 * Assembled with `assemblePrintProject`, the same builder the account autosave
 * uses, so a book filed here and the same book saved to Firestore are the same
 * object built the same way and cannot describe different books.
 *
 * Returns the id it was filed under, or null if it could not be filed — so the
 * caller can tell a filed project from one that could not be written, and can
 * point the account save at the same document.
 *
 * That id is not necessarily the working copy's own. Printing the same recipes
 * again produces a fresh working copy with a fresh id, and filing it blindly
 * added a second identical project to the library every single time. So the
 * CONTENT decides: the same set of recipes, as the same kind of document, files
 * back over the project it was last time. See lib/projectIdentity.
 */
/**
 * Which document this content files back into.
 *
 * Normally the content index decides, so printing the same recipes again edits
 * the project they became last time instead of adding a fresh copy of it to the
 * library every single time. That is the whole point of the index.
 *
 * A PURCHASE is where that has to stop. An unlock hangs off one project id and
 * the client cannot move it — unlocks are server-written and the rules deny
 * every client write — so re-pointing a working copy at a different document
 * does not carry the purchase with it. It breaks two ways, and both have
 * somebody's money in them:
 *
 *   - the paid book files into an older id, so the cookbook they just bought
 *     comes back reading "Not purchased";
 *   - an unpaid book files into a paid one, which hands over a book nobody paid
 *     for AND overwrites the one somebody did.
 *
 * So when either id carries an unlock, the working copy keeps its own and the
 * index is left alone (see `fileProjectLocally`, which skips recording it).
 * Filing a second document is a blemish in a library; either of the above is a
 * customer out of pocket.
 */
function filingProjectId(contentKey: string | null, ownId: string | undefined): string {
  const indexed = lookupProjectId(contentKey);
  if (!indexed || indexed === ownId) return ownId ?? indexed ?? uid();
  if (isCookbookProjectUnlocked(ownId) || isCookbookProjectUnlocked(indexed)) {
    return ownId ?? uid();
  }
  return indexed;
}

/** A name someone can find this by later, from the recipes in it. */
function describeProject(printable: QueueItem[], cookbook: boolean): string {
  const first = printable.find((item) => item.recipe)?.recipe?.title?.trim();
  if (!first) return cookbook ? "Untitled cookbook" : "Recipe cards";
  const rest = printable.length - 1;
  return rest > 0 ? `${first} + ${rest} more` : first;
}

export function fileProjectLocally(items: QueueItem[], meta: ProjectMeta): string | null {
  const printable = items.filter((item) => item.status === "ready" && item.recipe);
  if (printable.length === 0) return null;

  /**
   * A book set aside is still a book — the same rule `currentProject` applies
   * on the print page. "Print as recipe cards instead" moves the cover,
   * chapters and front matter into `stashedCookbook` and leaves `meta` nearly
   * empty, so filing from the live fields alone would shelve a cookbook with
   * its cover and dedication missing.
   */
  const stash = meta.stashedCookbook;
  const cover = meta.cover ?? stash?.cover;

  // Stored device preferences, passed through rather than validated here: they
  // were written from already-validated live state, and the `?project=` loader
  // validates them again on the way back in (`isPrintCardSize` /
  // `isRecipePrintTemplate`), which is the right boundary for that check.
  const stored = readPrintSettings() ?? {};

  const isBook = Boolean(meta.cookbookMode || meta.stashedCookbook);
  const contentKey = projectContentKey(printable, isBook);
  const project = assemblePrintProject({
    // The content's existing project if it has one, otherwise this working
    // copy's own id — unless a purchase is riding on either, in which case the
    // working copy keeps its own. See `filingProjectId`.
    id: filingProjectId(contentKey, meta.projectId),
    // No account behind this copy — that is the entire point of the shelf.
    // Adopting it into an account later fills this in (see
    // lib/anonymousProjectAdoption).
    ownerUid: "",
    // A card job has no cover to take a name from, so it borrows the first
    // recipe's — "Banana Bread + 2 more" is findable later in a way that
    // "Recipe cards — 22/08/2026" never is.
    title: cover?.title || describeProject(printable, Boolean(meta.cookbookMode)),
    sections: buildSections(printable, meta),
    cover,
    backCover: meta.backCover ?? stash?.backCover,
    dedication: meta.dedication ?? stash?.dedication,
    frontMatter: meta.frontMatter ?? stash?.frontMatter,
    kind: meta.cookbookMode || meta.stashedCookbook ? "cookbook" : "printProject",
    settings: {
      cardSize: (stored.cardSize as PrintCardSize) ?? "letter",
      template: (stored.template as RecipePrintTemplate) ?? "classic",
      doubleSided: stored.doubleSided ?? true,
      showPhoto: stored.showPhoto ?? true,
      showSourceUrl: stored.showSourceUrl ?? false,
      showCutLines: stored.showCutLines ?? false,
      cookbookMode: meta.cookbookMode,
      tableOfContents: meta.tableOfContents,
      sectionDividers: meta.sectionDividers,
      bookPreset: meta.cookbookPreset,
      cookbookWelcomeCompleted: meta.cookbookWelcomeCompleted,
      tocKicker: meta.tocKicker,
      tocTitle: meta.tocTitle,
      photoStyle: meta.photoStyle,
    },
    itemPlacements: meta.itemPlacements,
    stashedCookbook: meta.stashedCookbook,
  });

  if (!saveLocalProject(project)) return null;
  // Never index a paid book. An entry here is an invitation for some later set
  // of the same recipes to file straight over this document, and the one
  // document that must not be written over by another book is the one somebody
  // bought. Leaving it unindexed costs a duplicate at worst.
  if (!isCookbookProjectUnlocked(project.id)) rememberProjectId(contentKey, project.id);
  return project.id;
}

/**
 * The local-only projects that belong in a LIST of your work.
 *
 * The device shelf is a safety net — the workspace files a copy of whatever
 * you were doing when you leave it, which is not a decision you made — so
 * almost none of it should appear beside things you actually saved. Recipe
 * cards reach your projects because you pressed Save, and for no other reason.
 *
 * The exception is a cookbook that has been PAID FOR, and it is not a
 * half-measure. A signed-out purchase records its unlock in the local map
 * (lib/cookbookUnlocks) against the local project id, so hiding that project
 * would hide the thing the money bought. It stays listed until the account
 * holds it.
 *
 * Nothing here deletes: the shelf is untouched on disk, and a draft you didn't
 * save simply stops presenting itself as filed.
 */
// Generic over the project shape: the filter only reads `id` and `kind`, and
// the projects list now holds summaries for account books and summaries of the
// device shelf alike, so pinning this to the full `PrintProject` would have
// forced whole books to be kept in memory for a question about two fields.
export function listableLocalProjects<T extends { id: string; kind?: PrintProject["kind"] }>(
  localProjects: readonly T[],
  accountProjectIds: ReadonlySet<string>,
  isPaidCookbook: (projectId: string) => boolean,
): T[] {
  return localProjects.filter(
    (project) =>
      !accountProjectIds.has(project.id) &&
      project.kind !== "printProject" &&
      isPaidCookbook(project.id),
  );
}
