"use client";

import { useMemo, useState, type DragEvent } from "react";
import { track, truncateReason, type ImportFailureCode } from "@/lib/analytics";
import { filterImportSummaries, type ImportSummary } from "@/lib/importSummary";
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
import { BookIcon, ICON_SIZE, SpinnerIcon, UploadIcon } from "@/components/icons";

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
 * This was four platforms with their own line each, which was eight lines
 * saying nearly the same thing four times: the command has one name
 * everywhere, and only its menu and its landing place differ. Two sentences
 * carry the whole of it.
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
      </button>
      {open && (
        <div className="mt-cp-2 flex flex-col gap-1 text-cp-caption text-ink-soft">
          <p>
            Paprika calls it Export Recipes: the File menu on Mac and Windows, Settings on
            iPhone and Android.
          </p>
          <p>
            Choose the Paprika Recipe Format and it saves one file holding every recipe.
            iPhone puts it in Files, Android in Downloads.
          </p>
        </div>
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
  onRemoveRecipe,
  onLibraryChange,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
  /** Lets the integrations list re-read the open file's name and count. */
  onLibraryChange?: () => void;
}) {
  const [library, setLibrary] = useState<PaprikaLibrary | null>(() => cachedPaprikaLibrary());
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  // Memoized so the derivations below don't see a brand-new empty array on
  // every render while no file is open.
  const entries = useMemo(() => library?.entries ?? [], [library]);
  const byId = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry] as const)),
    [entries],
  );
  const rows = useMemo(() => entries.map(paprikaImportSummary), [entries]);
  const visibleRows = useMemo(() => filterImportSummaries(rows, queryText), [rows, queryText]);
  const allVisibleAdded =
    visibleRows.length > 0 && visibleRows.every((row) => addedIds.has(row.queueId));

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

  async function handleToggle(row: ImportSummary) {
    const entry = byId.get(row.id);
    if (!entry || addingIds.has(entry.id)) return;
    if (addedIds.has(row.queueId)) {
      onRemoveRecipe(row.queueId);
      return;
    }
    setError(null);
    setAddingIds((current) => new Set(current).add(entry.id));
    try {
      onAddRecipes([await toQueueItem(entry)]);
    } catch {
      setError("We couldn't add that recipe. Please try again.");
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  }

  async function handleAddAll() {
    if (bulkBusy) return;
    if (allVisibleAdded) {
      visibleRows.forEach((row) => onRemoveRecipe(row.queueId));
      return;
    }
    setError(null);
    setBulkBusy(true);
    try {
      const targets = visibleRows
        .filter((row) => !addedIds.has(row.queueId))
        .map((row) => byId.get(row.id))
        .filter((entry): entry is PaprikaEntry => Boolean(entry));
      if (targets.length === 0) return;
      const queueItems: QueueItem[] = [];
      for (const entry of targets) queueItems.push(await toQueueItem(entry));
      onAddRecipes(queueItems);
    } catch {
      setError("We couldn't add those recipes. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  function chooseAnotherFile() {
    setPaprikaLibrary(null);
    setLibrary(null);
    setQueryText("");
    setError(null);
    onLibraryChange?.();
  }

  if (!library) {
    return <PaprikaFilePicker busy={reading} error={fileError} onChoose={handleFile} />;
  }

  return (
    <div className="flex flex-col gap-cp-4">
      <RecipeSourceList
        heading="Paprika recipes"
        countLabel={entries.length > 0 ? `(${entries.length})` : undefined}
        summaries={visibleRows}
        addedIds={addedIds}
        addingIds={addingIds}
        bulkBusy={bulkBusy}
        allVisibleAdded={allVisibleAdded}
        onToggle={handleToggle}
        onAddAll={handleAddAll}
        queryText={queryText}
        onQueryChange={setQueryText}
        searchId="paprika-search"
        searchLabel="Search your Paprika recipes"
        error={error}
        fallbackIcon={BookIcon}
      />
      <div className="flex flex-wrap items-center justify-between gap-cp-2 text-cp-caption text-ink-soft">
        <span className="truncate">From {library.fileName}</span>
        <button type="button" className="btn-ghost btn-compact" onClick={chooseAnotherFile}>
          <UploadIcon size={ICON_SIZE.sm} />
          Use a different file
        </button>
      </div>
    </div>
  );
}
