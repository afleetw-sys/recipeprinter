/**
 * Imports that "worked" but read the recipe wrong.
 *
 * A failed import is captured (lib/failedImportCapture). One that succeeds but
 * puts the method in the ingredients, or folds every step into one, is not:
 * it looks like success everywhere. The tell is what the cook does next.
 * Someone who rewrites half the lines straight after importing is fixing our
 * reading by hand, and their corrected recipe is exactly what the parser
 * should have produced.
 *
 * So for a text or link import we remember what was pasted and what we read,
 * count the ingredient and step lines the cook changes in the next
 * `WATCH_MS`, and once enough have changed, file ONE `debugInbox` row holding
 * all three: the paste, our reading, and their correction. PostHog gets only
 * the counts, never the text.
 *
 * Everything here lives in memory for the page: a reload ends the watch,
 * which costs a row, never a wrong one.
 */
import { track } from "@/lib/analytics";
import { recordFailedImport } from "@/lib/failedImportCapture";
import { ingredientText } from "@/lib/recipeCardLayout";
import { localStore } from "@/lib/storage";
import type { ImportMethod, Recipe } from "@/types/recipe";

/** How long after an import edits still count as correcting it. */
const WATCH_MS = 15 * 60 * 1000;
/** Changed lines that mark a reading as wrong: this many, or this share. */
const MIN_CHANGED_LINES = 4;
const MIN_CHANGED_SHARE = 0.3;
/** Wait for the cook to stop editing, so the row holds the finished fix. */
const SETTLE_MS = 45 * 1000;
/** At most this many rows per browser per day, so a bad threshold can't flood the inbox. */
const DAILY_CAP = 5;
const CAP_KEY = "recipeprinter:import-corrections:v1";

interface Watch {
  source: ImportMethod;
  pasted: string;
  read: Recipe;
  readLines: string[];
  importedAt: number;
  latest: Recipe | null;
  timer: ReturnType<typeof setTimeout> | null;
  reported: boolean;
}

const watches = new Map<string, Watch>();

/** The lines that make up a recipe's reading: its ingredients and its steps. */
export function recipeLines(recipe: Recipe): string[] {
  return [
    ...recipe.ingredients.map((ingredient) => ingredientText(ingredient).trim()),
    ...recipe.instructions.map((step) => step.text.trim()),
  ].filter(Boolean);
}

/**
 * How many lines differ between our reading and the cook's current recipe:
 * lines of ours they removed or rewrote, plus lines they added.
 */
export function changedLineCount(read: readonly string[], now: readonly string[]): number {
  const remaining = new Map<string, number>();
  for (const line of now) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  let kept = 0;
  for (const line of read) {
    const left = remaining.get(line) ?? 0;
    if (left > 0) {
      kept += 1;
      remaining.set(line, left - 1);
    }
  }
  return read.length - kept + (now.length - kept);
}

/** Whether that many changes mean the import read the recipe wrong. */
export function looksCorrected(changed: number, readLineCount: number): boolean {
  if (changed >= MIN_CHANGED_LINES) return true;
  return readLineCount > 0 && changed / readLineCount >= MIN_CHANGED_SHARE && changed >= 2;
}

/** Start watching a text or link import that just succeeded. */
export function noteImported(itemId: string, source: ImportMethod, pasted: string, recipe: Recipe): void {
  if (source !== "text" && source !== "url") return;
  watches.set(itemId, {
    source,
    pasted,
    read: recipe,
    readLines: recipeLines(recipe),
    importedAt: Date.now(),
    latest: null,
    timer: null,
    reported: false,
  });
}

/** Every edit to a recipe passes through here (see `updateRecipe` in lib/queue). */
export function noteRecipeEdited(itemId: string, recipe: Recipe): void {
  const watch = watches.get(itemId);
  if (!watch || watch.reported) return;
  if (Date.now() - watch.importedAt > WATCH_MS) {
    watches.delete(itemId);
    return;
  }
  watch.latest = recipe;
  if (watch.timer) clearTimeout(watch.timer);
  watch.timer = setTimeout(() => void settle(itemId), SETTLE_MS);
}

async function settle(itemId: string): Promise<void> {
  const watch = watches.get(itemId);
  if (!watch || watch.reported || !watch.latest) return;
  const nowLines = recipeLines(watch.latest);
  const changed = changedLineCount(watch.readLines, nowLines);
  if (!looksCorrected(changed, watch.readLines.length)) return;
  watch.reported = true;
  const minutes = Math.max(1, Math.round((Date.now() - watch.importedAt) / 60000));
  track("recipe_import_corrected", {
    source: watch.source,
    changedLines: changed,
    readLines: watch.readLines.length,
    minutes,
  });
  if (!claimDailySlot()) return;
  await recordFailedImport(
    {
      source: watch.source,
      category: "corrected_after_import",
      reason: `${changed} of ${watch.readLines.length} lines changed within ${minutes} min of importing`,
    },
    { payload: correctionPayload(watch.pasted, watch.read, watch.latest) },
  );
}

function section(title: string, recipe: Recipe): string {
  return [
    `=== ${title} ===`,
    `Title: ${recipe.title}`,
    "Ingredients:",
    ...recipe.ingredients.map((ingredient) => `- ${ingredientText(ingredient)}`),
    "Steps:",
    ...recipe.instructions.map((step, index) => `${index + 1}. ${step.text}`),
  ].join("\n");
}

/** The three things the row is for, as plain text in the existing `payload` field. */
export function correctionPayload(pasted: string, read: Recipe, corrected: Recipe): string {
  return [`=== WHAT THEY PASTED ===\n${pasted}`, section("WHAT WE READ", read), section("WHAT THEY CORRECTED IT TO", corrected)].join(
    "\n\n",
  );
}

function claimDailySlot(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const stored = localStore.getJson<{ day: string; count: number }>(CAP_KEY);
  const count = stored && stored.day === today ? stored.count : 0;
  if (count >= DAILY_CAP) return false;
  localStore.setJson(CAP_KEY, { day: today, count: count + 1 });
  return true;
}
