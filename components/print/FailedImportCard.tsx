"use client";

import { useRef, useState } from "react";
import { ICON_SIZE, ImageIcon, RefreshIcon, TextIcon, TrashIcon } from "@/components/icons";
import { partitionImageFiles, validateImageFiles } from "@/lib/imageImport";
import type { QueueItem } from "@/types/recipe";

/**
 * The page an import failed on.
 *
 * It stands where the recipe would have: the loading placeholder becomes this
 * instead of vanishing. The failure used to be a toast and nothing else, which
 * had two costs. A toast is transient, so the answer to "what happened to the
 * one I added?" expired while the cook was still looking for it; and it carried
 * `shortImportError(errorCode)` — a bucket label — while the sentence written
 * for exactly this moment sat unused on `item.error`. The home page had been
 * showing that sentence all along, so the workspace said less about a failure
 * than the page you came from.
 *
 * The actions are the point, though. Our most common failure is a site that
 * blocks automated readers, and its error text already ends "Paste the recipe
 * text or upload a screenshot to go around it" — an instruction with nothing to
 * click. Here that instruction IS the buttons, and both land back in this slot
 * (`repairItem`) rather than appending a new card and leaving this one to be
 * cleaned up by hand. Ours to fix, not the cook's to tidy.
 */
export function FailedImportCard({
  item,
  canRetry,
  onRetry,
  onRepairWithText,
  onRepairWithImages,
  onRemove,
}: {
  item: QueueItem;
  canRetry: boolean;
  onRetry: () => void;
  onRepairWithText: (text: string) => void;
  onRepairWithImages: (files: File[]) => void;
  onRemove: () => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function chooseFiles(list: FileList | null) {
    setFileError(null);
    const { images, rejected } = partitionImageFiles(list);
    if (images.length === 0) {
      if (rejected > 0) setFileError("Those files aren't photos we can read. Choose JPG or PNG images.");
      return;
    }
    const invalid = validateImageFiles(images);
    if (invalid) {
      setFileError(invalid.message);
      return;
    }
    onRepairWithImages(images);
  }

  return (
    <div className="recipe-page-failed__body" role="group" aria-label={`${item.source} didn't import`}>
      <p className="recipe-page-failed__heading">Couldn&apos;t import {item.source}</p>
      {/* The full sentence, not the bucket. It is the one piece of writing that
          knows what actually went wrong and what to do about it. */}
      <p className="recipe-page-failed__message">{item.error}</p>

      {pasting ? (
        <div className="recipe-page-failed__paste">
          <label className="recipe-page-failed__label" htmlFor={`repair-text-${item.id}`}>
            Recipe text
          </label>
          <textarea
            id={`repair-text-${item.id}`}
            className="recipe-page-failed__textarea"
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            placeholder={"Paste the title, ingredients and steps.\nAny layout is fine."}
          />
          <div className="recipe-page-failed__actions">
            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={text.trim().length < 20}
              onClick={() => onRepairWithText(text)}
            >
              Use this text
            </button>
            <button
              type="button"
              className="btn-ghost btn-compact"
              onClick={() => setPasting(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="recipe-page-failed__actions">
          {/* Only when re-running the same input could actually go differently.
              A photo import can't: the files aren't kept, so the way back is
              picking them again, which is its own button. */}
          {canRetry && (
            <button type="button" className="btn btn-primary btn-compact" onClick={onRetry}>
              <RefreshIcon size={ICON_SIZE.md} />
              Try again
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={() => setPasting(true)}
          >
            <TextIcon size={ICON_SIZE.md} />
            Paste the text
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon size={ICON_SIZE.md} />
            Add a screenshot
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost--danger btn-compact"
            onClick={onRemove}
          >
            <TrashIcon size={ICON_SIZE.md} />
            Remove
          </button>
        </div>
      )}

      {fileError && <p className="recipe-page-failed__file-error">{fileError}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          chooseFiles(event.target.files);
          // Cleared so re-picking the same file fires `change` again.
          event.target.value = "";
        }}
      />
    </div>
  );
}
