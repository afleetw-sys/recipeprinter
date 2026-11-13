"use client";

import { useEffect, useMemo, useState } from "react";
import { track, truncateReason, type ImportFailureCode } from "@/lib/analytics";
import { filterImportSummaries, type ImportSummary } from "@/lib/importSummary";
import {
  allSelectableSelected as allSelectableSelectedIn,
  partialAddMessage,
  selectableQueueIds,
  toggleSelection,
  toggleSingleSelection,
} from "@/lib/importSelection";
import { localPhotoUrl, putLocalPhoto } from "@/lib/localPhotos";
import {
  PaprikaImportError,
  paprikaQueueItem,
  readPaprikaFile,
  type PaprikaEntry,
  type PaprikaLibrary,
} from "@/lib/paprikaImport";
import {
  cachedPaprikaLibrary,
  paprikaImportSummary,
  setPaprikaLibrary,
} from "@/lib/paprikaLibrary";
import type { QueueItem } from "@/types/recipe";
import { RecipeSourceList, type LibraryCommitRef } from "@/components/import/RecipeSourceList";
import { BookIcon, CheckIcon, ICON_SIZE, UploadIcon } from "@/components/icons";

/**
 * Import from a Paprika export.
 *
 * Paprika has no API worth using — its sync endpoint wants a plaintext email
 * and password, which is not a trade a printing app should offer anyone — but
 * its export file is completely readable, so this is a file the cook already
 * has rather than an account they have to hand over. Once it's open the
 * experience is the same as CookPilot's: search the library, add what you want.
 */

/** The card owns the file dialog now; this is what it accepts. */
export const PAPRIKA_ACCEPT = ".paprikarecipes,.paprikarecipe,.zip";

/**
 * Where the file is.
 *
 * Numbered steps, in the order you actually press them. Prose describing the
 * menus ("the File menu on Mac and Windows, Settings on iPhone and Android")
 * asked the cook to work out which half of the sentence was theirs; a list you
 * follow does not.
 *
 * It expands in place rather than opening a dialog, because on the print page
 * this panel is ALREADY inside the Add-recipe dialog and a modal over a modal
 * is not a way out of a long list. Staying short is what makes that work.
 */
/**
 * Read a chosen export into the cache, or come back with something to say.
 *
 * Lives here beside the parsing it wraps, but is called from the integrations
 * card: the file dialog opens there now, so that is also where a file that
 * will not read has to report itself. Resolves either way rather than
 * throwing, because both outcomes are things the card renders.
 */
export async function readPaprikaExport(
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  track("recipe_import_started", { source: "paprika" });
  try {
    setPaprikaLibrary(await readPaprikaFile(file));
    return { ok: true };
  } catch (err) {
    const code: ImportFailureCode =
      err instanceof PaprikaImportError ? err.code : "unreadable_file";
    const message =
      err instanceof PaprikaImportError
        ? err.message
        : "We couldn't read that file. Please try exporting from Paprika again.";
    // The file never became recipes, so no queue item exists to report this —
    // pair it with the started event here or the funnel loses the attempt.
    track("recipe_import_failed", {
      source: "paprika",
      category: code,
      reason: truncateReason(err instanceof Error ? err.message : String(err)),
    });
    return { ok: false, message };
  }
}

/**
 * The file's name, minus the part that only a computer needs.
 *
 * Paprika's own exports are named "Export <date> <time> All Recipes", so the
 * date is what tells two of them apart and the extension never does. CSS
 * truncates whatever is left to the width available; `title` keeps the real
 * name for anyone who wants it.
 */
function displayFileName(name: string): string {
  return name.replace(/\.(paprikarecipes?|zip)$/i, "");
}

/** A recipe plus its photo, held locally, ready for the print list. */
async function toQueueItem(entry: PaprikaEntry): Promise<QueueItem> {
  if (!entry.photo) return paprikaQueueItem(entry);
  const id = await putLocalPhoto(entry.photo);
  const url = id ? await localPhotoUrl(id) : null;
  // A photo we couldn't store is a photo the recipe goes without, never a
  // recipe the cook doesn't get.
  return paprikaQueueItem(entry, id && url ? { id, url } : undefined);
}

export function PaprikaImportSource({
  items,
  onAddRecipes,
  commitLabel,
  commitLeavesPage = false,
  onCommitEmpty,
  commitRef,
  onLibraryChange,
  onChooseAnotherFile,
  replaceError,
  locked = false,
  singleSelect = false,
  onLockedTap,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  /** What the surrounding panel's submit says — see ImportPanel. */
  commitLabel: string;
  /** And whether pressing it navigates, which decides its icon. */
  commitLeavesPage?: boolean;
  onCommitEmpty?: () => void;
  /** See `LibraryCommitRef`: the add dialog's Done adds the selection. */
  commitRef?: LibraryCommitRef;
  /** Lets the integrations list re-read the open file's name and count. */
  onLibraryChange?: () => void;
  /** Opens the file dialog again, which lives on the card. */
  onChooseAnotherFile: () => void;
  /** A file chosen from in here that would not read. Shown under the banner
      naming the file it failed to replace. */
  replaceError?: string | null;
  /** This account already has the one recipe a free, non-cookbook plan can
      print — see `RecipeSourceList`'s own `locked` doc. Every row shows a Pro
      badge instead of a tickbox and tapping one calls `onLockedTap` instead
      of selecting. */
  locked?: boolean;
  /** Free, non-cookbook, and the project is still empty: this account's
      *next* add is the one free recipe it gets, so ticking a second row
      swaps the first out rather than piling up a selection nothing can ever
      commit in full. */
  singleSelect?: boolean;
  /** Opens the Pro upgrade dialog — only ever called while `locked`. */
  onLockedTap?: () => void;
}) {
  // Read once on mount and never set again: a new file remounts this component
  // (see the `key` on the call site), so there is no in-place swap to make.
  const [library] = useState<PaprikaLibrary | null>(() => cachedPaprikaLibrary());
  const [queryText, setQueryText] = useState("");
  /** Queue ids ticked but not yet added — see lib/importSelection.
      A file with one recipe in it opens with that recipe ticked: there is
      nothing to choose between, so the only step left is Add. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const only = library?.entries.length === 1 ? paprikaImportSummary(library.entries[0]!) : null;
    if (!only || locked || items.some((item) => item.id === only.queueId)) return new Set();
    return new Set([only.queueId]);
  });
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  // Memoized so the derivations below don't see a brand-new empty array on
  // every render while no file is open.
  const entries = useMemo(() => library?.entries ?? [], [library]);
  const rows = useMemo(() => entries.map(paprikaImportSummary), [entries]);
  /* Selection is keyed by queue id; committing needs the entry behind it. */
  const byQueueId = useMemo(
    () => new Map(rows.map((row, index) => [row.queueId, entries[index]!] as const)),
    [rows, entries],
  );
  const visibleRows = useMemo(() => filterImportSummaries(rows, queryText), [rows, queryText]);
  const allVisibleSelected = allSelectableSelectedIn(visibleRows, addedIds, selectedIds);



  /** Local and instant: no photo is stored until the commit. */
  function handleToggle(row: ImportSummary) {
    if (addedIds.has(row.queueId)) return;
    if (locked) {
      onLockedTap?.();
      return;
    }
    if (error) setError(null);
    setSelectedIds((current) =>
      singleSelect ? toggleSingleSelection(current, row.queueId) : toggleSelection(current, row.queueId),
    );
  }

  function handleToggleAll() {
    if (committing || locked) return;
    if (error) setError(null);
    if (allVisibleSelected) {
      // Only what is on screen: a selection made under an earlier search is
      // still the cook's, and clearing a filtered view should not reach past it.
      const visible = new Set(visibleRows.map((row) => row.queueId));
      setSelectedIds((current) => new Set(Array.from(current).filter((id) => !visible.has(id))));
      return;
    }
    const targets = selectableQueueIds(visibleRows, addedIds);
    setSelectedIds((current) => new Set(Array.from(current).concat(targets)));
  }

  /**
   * The one write to the print list.
   *
   * Each recipe's photo is stored on its own, so one that can't be written
   * costs that recipe and no other. Whatever came over is added; whatever did
   * not stays ticked, which makes "try again" the same button with a smaller
   * count on it. See `partialAddMessage`.
   */
  async function handleCommit(): Promise<boolean> {
    if (committing) return false;
    if (selectedIds.size === 0) return true;
    const targets = Array.from(selectedIds)
      .map((queueId) => byQueueId.get(queueId))
      .filter((entry): entry is PaprikaEntry => Boolean(entry));
    if (targets.length === 0) return true;
    setError(null);
    setCommitting(true);
    try {
      const queueItems: QueueItem[] = [];
      const failed = new Set<string>();
      for (const entry of targets) {
        try {
          queueItems.push(await toQueueItem(entry));
        } catch {
          failed.add(paprikaImportSummary(entry).queueId);
        }
      }
      onAddRecipes(queueItems);
      setSelectedIds((current) => new Set(Array.from(current).filter((id) => failed.has(id))));
      if (failed.size > 0) setError(partialAddMessage(queueItems.length, failed.size));
      return failed.size === 0;
    } finally {
      setCommitting(false);
    }
  }

  // Re-registered every render so Done always commits the current selection.
  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = handleCommit;
    return () => {
      commitRef.current = null;
    };
  });

  // Nothing is cleared here any more. The dialog opens on the card, and only a
  // file that actually READ replaces this one: clearing first meant a cook who
  // opened the dialog and thought better of it lost the library they had.
  // Reading a new one remounts this component, which is what resets the
  // selection — and a selection belongs to the file it was made in.
  if (!library) return null;

  return (
    <div className="flex flex-col gap-cp-4">
      {/* Where the cook is, as two numbered steps. Opening the file used to
          look like the whole import: a buyer took the list that followed for
          a dead end and paid for a cookbook to get their recipes in. Step one
          is ticked off and folded to one line, the file it brought in with
          Change beside it, so the list below reads as the step still to do
          (Amelia, 2026-11-13: the open file used to fill a card of its own). */}
      <ol className="import-steps" aria-label="Importing from Paprika">
        <li className="import-steps__step import-steps__step--done">
          <div className="import-steps__head">
            <span className="import-steps__num" aria-hidden>
              <CheckIcon size={ICON_SIZE.sm} />
            </span>
            <span className="sr-only">Import your file:</span>
            {/* The open file, by name without its extension (Paprika's
                timestamp is the part that tells two exports apart). */}
            <span
              className="min-w-0 flex-1 truncate"
              // The full name, extension included, for anyone who wants it.
              title={library.fileName}
            >
              {displayFileName(library.fileName)}
              <span className="font-normal">
                {" · "}
                {entries.length} {entries.length === 1 ? "recipe" : "recipes"}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-compact flex-shrink-0"
              onClick={onChooseAnotherFile}
            >
              <UploadIcon size={ICON_SIZE.sm} />
              Change
            </button>
          </div>
          {/* Under the file whose Change caused it. The library on screen is
              still the old one, so this says what did not happen rather than
              replacing the list with an error. */}
          {replaceError && (
            <p className="import-steps__body field-error" role="alert">
              {replaceError}
            </p>
          )}
        </li>
        {/* Last, and the list follows it directly: the list's Add button pins
            itself to the bottom of the scroller, so nothing can sit under it. */}
        <li className="import-steps__step" aria-current="step">
          <div className="import-steps__head">
            <span className="import-steps__num" aria-hidden>2</span>
            {singleSelect ? "Choose a recipe to import" : "Choose recipes to import"}
          </div>
        </li>
      </ol>

      <RecipeSourceList
        heading="Paprika recipes"
        countLabel={entries.length > 0 ? `(${entries.length})` : undefined}
        summaries={visibleRows}
        addedIds={addedIds}
        selectedIds={selectedIds}
        allSelectableSelected={allVisibleSelected}
        onToggle={handleToggle}
        onToggleAll={handleToggleAll}
        onCommit={handleCommit}
        commitLabel={commitLabel}
        commitLeavesPage={commitLeavesPage}
        onCommitEmpty={onCommitEmpty}
        hideCommit={Boolean(commitRef)}
        /* "Choose a recipe, or upgrade to print several" means nothing to a
           file with one recipe in it, so it is only offered when there is a
           choice to make. */
        onUpgrade={entries.length > 1 ? onLockedTap : undefined}
        committing={committing}
        locked={locked}
        singleSelect={singleSelect}
        queryText={queryText}
        onQueryChange={setQueryText}
        // A short file is read at a glance; the box only earns its room
        // from ten recipes up.
        searchable={entries.length >= 10}
        searchId="paprika-search"
        searchLabel="Search your Paprika recipes"
        error={error}
        fallbackIcon={BookIcon}
      />
    </div>
  );
}
