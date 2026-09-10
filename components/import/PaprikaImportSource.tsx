"use client";

import { useMemo, useState, type DragEvent } from "react";
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
import { BookIcon, ChevronDownIcon, ICON_SIZE, SpinnerIcon, UploadIcon } from "@/components/icons";

/**
 * Import from a Paprika export.
 *
 * Paprika has no API worth using — its sync endpoint wants a plaintext email
 * and password, which is not a trade a printing app should offer anyone — but
 * its export file is completely readable, so this is a file the cook already
 * has rather than an account they have to hand over. Once it's open the
 * experience is the same as CookPilot's: search the library, add what you want.
 */

const ACCEPT = ".paprikarecipes,.paprikarecipe,.zip";

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
function ExportHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-cp-4">
      <button
        type="button"
        className="btn-ghost btn-compact"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Where do I find that file?
        <ChevronDownIcon size={ICON_SIZE.sm} className="cp-disclosure-caret" aria-hidden />
      </button>
      {open && (
        <ol className="paprika-export-steps mt-cp-2 text-cp-caption text-ink-soft">
          <li>Open the Paprika app.</li>
          <li>Click the menu in the top left.</li>
          <li>Go to Settings.</li>
          <li>Click Export Recipes, then Export.</li>
        </ol>
      )}
    </div>
  );
}

function PaprikaFilePicker({
  busy,
  error,
  onChoose,
}: {
  busy: boolean;
  error: string | null;
  onChoose: (file: File | null | undefined) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    onChoose(event.dataTransfer.files[0]);
  }

  return (
    <div>
      <label className="field-label">Paprika export</label>
      <label
        className={`dropzone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
            return;
          }
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept={ACCEPT}
          disabled={busy}
          className="sr-only absolute h-px w-px overflow-hidden"
          onChange={(event) => {
            onChoose(event.target.files?.[0]);
            // Clear it so choosing the SAME file again still fires onChange —
            // otherwise a retry after an error looks like nothing happened.
            event.target.value = "";
          }}
        />
        {busy ? <SpinnerIcon size={26} /> : <UploadIcon size={26} />}
        <span className="text-cp-body">
          {busy ? "Reading your recipes…" : "Choose your .paprikarecipes file"}
        </span>
        <span className="text-cp-caption font-medium text-ink-soft">
          Everything stays in your browser. Nothing is uploaded.
        </span>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <ExportHelp />
    </div>
  );
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
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  /** What the surrounding panel's submit says — see ImportPanel. */
  commitLabel: string;
  /** And whether pressing it navigates, which decides its icon. */
  commitLeavesPage?: boolean;
  /** Lets the integrations list re-read the open file's name and count. */
  onLibraryChange?: () => void;
}) {
  const [library, setLibrary] = useState<PaprikaLibrary | null>(() => cachedPaprikaLibrary());
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
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

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setReading(true);
    setFileError(null);
    track("recipe_import_started", { source: "paprika" });
    try {
      const next = await readPaprikaFile(file);
      setPaprikaLibrary(next);
      setLibrary(next);
      setQueryText("");
      setSelectedIds(new Set());
      onLibraryChange?.();
    } catch (err) {
      const code: ImportFailureCode =
        err instanceof PaprikaImportError ? err.code : "unreadable_file";
      setFileError(
        err instanceof PaprikaImportError
          ? err.message
          : "We couldn't read that file. Please try exporting from Paprika again.",
      );
      // The file never became recipes, so no queue item exists to report this —
      // pair it with the started event here or the funnel loses the attempt.
      track("recipe_import_failed", {
        source: "paprika",
        category: code,
        reason: truncateReason(err),
      });
    } finally {
      setReading(false);
    }
  }

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

  function chooseAnotherFile() {
    setPaprikaLibrary(null);
    setLibrary(null);
    setQueryText("");
    setError(null);
    // A selection belongs to the file it was made in; the next one has its own
    // ids and nothing of this one's should carry over into it.
    setSelectedIds(new Set());
    onLibraryChange?.();
  }

  if (!library) {
    return <PaprikaFilePicker busy={reading} error={fileError} onChoose={handleFile} />;
  }

  return (
    <div className="flex flex-col gap-cp-4">
      {/* Which file this library came from, ABOVE the list rather than under
          it. It is a caption on the source, so it reads better next to the
          heading than as a trailing line — and structurally it has to be here,
          because the list's Add button pins itself to the bottom of the
          scroller and anything left below the list would stop it reaching
          there, leaving it floating over a strip of recipes it could not
          cover. */}
      <div className="flex flex-wrap items-center justify-between gap-cp-2 text-cp-caption text-ink-soft">
        <span className="truncate">From {library.fileName}</span>
        <button type="button" className="btn-ghost btn-compact" onClick={chooseAnotherFile}>
          <UploadIcon size={ICON_SIZE.sm} />
          Use a different file
        </button>
      </div>
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
