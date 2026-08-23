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

function readAll(): LocalProjectMap {
  const parsed = localStore.getJson<LocalProjectMap>(LOCAL_PROJECTS_KEY);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
}

function writeAll(map: LocalProjectMap): boolean {
  return localStore.setJson(LOCAL_PROJECTS_KEY, map);
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

  const map = readAll();
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

export function loadLocalProject(projectId: string): PrintProject | null {
  return readAll()[projectId] ?? null;
}

export function deleteLocalProject(projectId: string): void {
  const map = readAll();
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
  const map = readAll();
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
 * Returns whether it was actually filed, so the caller can decide whether it is
 * safe to release the working copy.
 */
/** A name someone can find this by later, from the recipes in it. */
function describeProject(printable: QueueItem[], cookbook: boolean): string {
  const first = printable.find((item) => item.recipe)?.recipe?.title?.trim();
  if (!first) return cookbook ? "Untitled cookbook" : "Recipe cards";
  const rest = printable.length - 1;
  return rest > 0 ? `${first} + ${rest} more` : first;
}

export function fileProjectLocally(items: QueueItem[], meta: ProjectMeta): boolean {
  const printable = items.filter((item) => item.status === "ready" && item.recipe);
  if (printable.length === 0) return false;

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

  const project = assemblePrintProject({
    id: meta.projectId ?? uid(),
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

  return saveLocalProject(project);
}
