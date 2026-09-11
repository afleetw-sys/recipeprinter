"use client";

import { useMemo, useState } from "react";
import { track, truncateReason, type ImportFailureCode } from "@/lib/analytics";
import { filterImportSummaries, type ImportSummary } from "@/lib/importSummary";
import {
  allSelectableSelected as allSelectableSelectedIn,
  partialAddMessage,
  selectableQueueIds,
  toggleSelection,
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
import { RecipeSourceList } from "@/components/import/RecipeSourceList";
import { BookIcon, ICON_SIZE, PaprikaLogoIcon, UploadIcon } from "@/components/icons";

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
  onLibraryChange,
  onChooseAnotherFile,
  replaceError,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  /** What the surrounding panel's submit says — see ImportPanel. */
  commitLabel: string;
  /** And whether pressing it navigates, which decides its icon. */
  commitLeavesPage?: boolean;
  /** Lets the integrations list re-read the open file's name and count. */
  onLibraryChange?: () => void;
  /** Opens the file dialog again, which lives on the card. */
  onChooseAnotherFile: () => void;
  /** A file chosen from in here that would not read. Shown under the banner
      naming the file it failed to replace. */
  replaceError?: string | null;
}) {
  // Read once on mount and never set again: a new file remounts this component
  // (see the `key` on the call site), so there is no in-place swap to make.
  const [library] = useState<PaprikaLibrary | null>(() => cachedPaprikaLibrary());
  const [queryText, setQueryText] = useState("");
  /** Queue ids ticked but not yet added — see lib/importSelection. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    if (error) setError(null);
    setSelectedIds((current) => toggleSelection(current, row.queueId));
  }

  function handleToggleAll() {
    if (committing) return;
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
  async function handleCommit() {
    if (committing || selectedIds.size === 0) return;
    const targets = Array.from(selectedIds)
      .map((queueId) => byQueueId.get(queueId))
      .filter((entry): entry is PaprikaEntry => Boolean(entry));
    if (targets.length === 0) return;
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
    } finally {
      setCommitting(false);
    }
  }

  // Nothing is cleared here any more. The dialog opens on the card, and only a
  // file that actually READ replaces this one: clearing first meant a cook who
  // opened the dialog and thought better of it lost the library they had.
  // Reading a new one remounts this component, which is what resets the
  // selection — and a selection belongs to the file it was made in.
  if (!library) return null;

  return (
    <div className="flex flex-col gap-cp-4">
      {/* Which file this library came from, ABOVE the list rather than under
          it. It is a caption on the source, so it reads better next to the
          heading than as a trailing line — and structurally it has to be here,
          because the list's Add button pins itself to the bottom of the
          scroller and anything left below the list would stop it reaching
          there, leaving it floating over a strip of recipes it could not
          cover. */}
      {/* The open file, as a thing rather than a sentence. This was the line
          "From Export 2026-09-01 11.12.03 All Recipes.paprikarecipes", which is
          a path read aloud: the extension is machine-facing, the timestamp is
          the only part that distinguishes one export from another, and none of
          it looks like the rest of the product. A tinted row with the app's own
          mark, the name without its extension, and one button to swap it.  */}
      <div className="flex items-center gap-cp-3 rounded-xl bg-page p-cp-2">
        <PaprikaLogoIcon size={26} />
        <span
          className="min-w-0 flex-1 truncate text-cp-body font-semibold text-ink"
          // The full name, extension included, for anyone who does want it.
          title={library.fileName}
        >
          {displayFileName(library.fileName)}
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

      {/* Directly under the banner, which is where the Change button that
          caused it lives. The library on screen is still the old one, so the
          message has to say what did not happen rather than replacing the
          list with an error. */}
      {replaceError && (
        <p className="field-error" role="alert">
          {replaceError}
        </p>
      )}

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
        committing={committing}
        queryText={queryText}
        onQueryChange={setQueryText}
        searchId="paprika-search"
        searchLabel="Search your Paprika recipes"
        error={error}
        fallbackIcon={BookIcon}
      />
    </div>
  );
}
