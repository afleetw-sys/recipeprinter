"use client";

import { useEffect, useRef, useState } from "react";
import { ImportPanel } from "@/components/ImportPanel";
import {
  CheckIcon,
  ICON_SIZE,
  RefreshIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/Controls";
import type { QueueItem } from "@/types/recipe";

// A lighter version of the homepage's import panel, for adding to a print job
// or a cookbook without leaving the deck.
//
// It used to close the moment you submitted a URL, an image, or text — fine for
// "add one and get back", but wrong for the common case: someone building a
// cookbook is adding five recipes, not one, and had to re-open the dialog and
// re-find their import method every single time. It now stays open until it's
// closed on purpose, and reports what's happening to each recipe in a running
// list, since parsing finishes well after the submit and the deck behind the
// dialog is covered up.
export function AddRecipeDialog({
  open,
  onClose,
  items,
  focusedItemId,
  focusNonce,
  canRetry,
  onRetry,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
  onRemoveRecipe,
}: {
  open: boolean;
  onClose: () => void;
  items: QueueItem[];
  /** Set by the queue when an import matched a recipe that's already here. */
  focusedItemId: string | null;
  focusNonce: number;
  canRetry: (item: QueueItem) => boolean;
  onRetry: (id: string) => void;
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  // Ids that were already in the queue when this dialog opened. Everything
  // else is something added in this sitting, which is exactly the list worth
  // showing — the whole queue would just be the deck the dialog is covering.
  const baselineRef = useRef<Set<string>>(new Set());
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  const seenFocusNonceRef = useRef(focusNonce);

  useEffect(() => {
    if (!open) return;
    baselineRef.current = new Set(items.map((item) => item.id));
    seenFocusNonceRef.current = focusNonce;
    setSessionIds([]);
    setDuplicateTitle(null);
    // Snapshot once per opening — re-running as `items` changes would fold
    // every new recipe straight back into the baseline and show nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Append rather than filter-on-render so a recipe removed from the queue
  // (via the trash button below) leaves the list instead of the list silently
  // reordering around it.
  useEffect(() => {
    if (!open) return;
    const added = items
      .filter((item) => !baselineRef.current.has(item.id))
      .map((item) => item.id);
    setSessionIds((current) =>
      added.length === current.length && added.every((id, i) => id === current[i])
        ? current
        : added,
    );
  }, [open, items]);

  // A re-import of something already in the job doesn't add a second copy —
  // the queue focuses the existing one and bumps `focusNonce`. On the deck
  // that shows up as a shake on the rail row, which this dialog is sitting on
  // top of, so say it here instead of letting the submit look ignored.
  useEffect(() => {
    if (!open || focusNonce === seenFocusNonceRef.current) return;
    seenFocusNonceRef.current = focusNonce;
    const existing = items.find((item) => item.id === focusedItemId);
    setDuplicateTitle(existing?.title || "That recipe");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, open]);

  const sessionItems = sessionIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is QueueItem => Boolean(item));
  const addedCount = sessionItems.filter((item) => item.status === "ready").length;

  function clearDuplicate() {
    if (duplicateTitle) setDuplicateTitle(null);
  }

  function handleAddUrl(url: string) {
    clearDuplicate();
    onAddUrl(url);
  }

  function handleAddImages(images: string[], label: string) {
    clearDuplicate();
    onAddImages(images, label);
  }

  function handleAddText(text: string) {
    clearDuplicate();
    onAddText(text);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="recipe-add-dialog-title"
      className="recipe-add-dialog no-print"
      backdropClassName="recipe-add-dialog__backdrop"
      panelClassName="recipe-add-dialog__panel"
    >
      <div className="recipe-add-dialog__header">
        <h2 id="recipe-add-dialog-title">Add recipes</h2>
        <button
          type="button"
          className="recipe-add-dialog__close icon-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      <div className="recipe-add-dialog__body">
        <ImportPanel
          items={items}
          onAddUrl={handleAddUrl}
          onAddImages={handleAddImages}
          onAddText={handleAddText}
          onAddCookPilotRecipes={onAddCookPilotRecipes}
          onRemoveRecipe={onRemoveRecipe}
        />

        {duplicateTitle && (
          <p className="recipe-add-dialog__duplicate" role="status">
            {duplicateTitle} is already in this project.
          </p>
        )}

        {sessionItems.length > 0 && (
          <div className="recipe-add-dialog__added">
            <h3 className="recipe-add-dialog__added-title">
              Added {addedCount > 0 ? `(${addedCount})` : ""}
            </h3>
            <ul className="recipe-add-dialog__added-list">
              {sessionItems.map((item) => (
                <li
                  key={item.id}
                  className={`recipe-add-dialog__added-row is-${item.status}`}
                >
                  <span className="recipe-add-dialog__added-icon" aria-hidden="true">
                    {item.status === "parsing" ? (
                      <SpinnerIcon size={ICON_SIZE.sm} />
                    ) : item.status === "ready" ? (
                      <CheckIcon size={ICON_SIZE.sm} />
                    ) : (
                      <XIcon size={ICON_SIZE.sm} />
                    )}
                  </span>
                  <span className="recipe-add-dialog__added-text">
                    <span className="recipe-add-dialog__added-name">{item.title}</span>
                    <span className="recipe-add-dialog__added-status">
                      {item.status === "parsing"
                        ? "Adding…"
                        : item.status === "ready"
                          ? "Added"
                          : item.error || "Couldn't read that one."}
                    </span>
                  </span>
                  {item.status === "error" && canRetry(item) && (
                    <IconButton
                      aria-label={`Retry ${item.title}`}
                      title="Try again"
                      onClick={() => onRetry(item.id)}
                    >
                      <RefreshIcon size={ICON_SIZE.sm} />
                    </IconButton>
                  )}
                  {item.status !== "parsing" && (
                    <IconButton
                      aria-label={`Remove ${item.title}`}
                      title="Remove"
                      tone="danger"
                      onClick={() => onRemoveRecipe(item.id)}
                    >
                      <TrashIcon size={ICON_SIZE.sm} />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* An explicit way out, because the dialog no longer closes itself. The
          count is the reassurance that the work landed — the deck behind is
          covered, so "Done" alone would be a leap of faith. */}
      <div className="recipe-add-dialog__footer">
        <button type="button" className="btn btn-primary w-full" onClick={onClose}>
          {addedCount > 0
            ? `Done · ${addedCount} added`
            : "Done"}
        </button>
      </div>
    </Dialog>
  );
}
