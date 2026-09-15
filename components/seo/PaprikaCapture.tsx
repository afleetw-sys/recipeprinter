"use client";

import { useRef, useState } from "react";
import {
  PAPRIKA_ACCEPT,
  PaprikaImportSource,
  readPaprikaExport,
} from "@/components/import/PaprikaImportSource";
import { SpinnerIcon, UploadIcon } from "@/components/icons";
import { cachedPaprikaLibrary } from "@/lib/paprikaLibrary";
import { useSingleRecipeOnly } from "@/lib/useSingleRecipeOnly";
import type { QueueItem } from "@/types/recipe";

/** Paprika-only entry into the same library picker used on the homepage. */
export function PaprikaCapture({
  busy,
  onAddRecipes,
}: {
  busy: boolean;
  onAddRecipes: (recipes: QueueItem[]) => number;
}) {
  // This capture always starts from an empty print list (`items={[]}` below,
  // same as PrinterWorkspace's own front door), so there's never a case where
  // this account already has a recipe to be locked out of adding a second —
  // only whether the next pick should cap at one. See the hook's own doc for
  // why every direct renderer of `PaprikaImportSource` needs this itself
  // rather than relying on RecipeAppsPanel's copy: this is the other one.
  const singleSelect = useSingleRecipeOnly();
  const inputRef = useRef<HTMLInputElement>(null);
  const readingRef = useRef(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLibrary, setHasLibrary] = useState(() => Boolean(cachedPaprikaLibrary()));
  const [libraryNonce, setLibraryNonce] = useState(0);
  const disabled = busy || reading;

  async function openFile(file?: File) {
    if (!file || busy || readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setError(null);
    try {
      const result = await readPaprikaExport(file);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLibraryNonce((value) => value + 1);
      setHasLibrary(true);
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={PAPRIKA_ACCEPT}
      disabled={disabled}
      aria-label="Open a Paprika file"
      className="sr-only absolute h-px w-px overflow-hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        void openFile(file);
      }}
    />
  );

  return (
    <fieldset disabled={disabled} className={`min-w-0 flex flex-col gap-cp-4 ${hasLibrary ? "panel p-cp-4" : ""}`} aria-busy={disabled}>
      {hasLibrary ? (
        <>
          {fileInput}
          <PaprikaImportSource
            key={libraryNonce}
            items={[]}
            onAddRecipes={onAddRecipes}
            commitLabel="Start printing"
            commitLeavesPage
            onChooseAnotherFile={() => inputRef.current?.click()}
            replaceError={error}
            singleSelect={singleSelect}
          />
          {reading && <p role="status" className="text-cp-caption text-ink-soft">Reading your Paprika file…</p>}
        </>
      ) : (
        <>
          <label
            className={`dropzone ${dragging ? "is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled) setDragging(true);
            }}
            onDragLeave={(event) => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void openFile(event.dataTransfer.files[0]);
            }}
          >
            {fileInput}
            {reading ? <SpinnerIcon size={26} /> : <UploadIcon size={26} />}
            <span className="text-cp-body">{reading ? "Reading your Paprika file…" : "Open a Paprika file"}</span>
            <span className="text-cp-caption font-medium text-ink-soft">Choose or drop your .paprikarecipes export here</span>
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
        </>
      )}
    </fieldset>
  );
}
