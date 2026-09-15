"use client";

import { ICON_SIZE, PlusIcon, TrashIcon } from "@/components/icons";
import type { QueueItem } from "@/types/recipe";

/**
 * A terminal import failure that keeps the page slot visible until the cook
 * either chooses another source or removes it. Re-running the same input is
 * deliberately not offered: a parse failure is normally deterministic, while
 * the Add recipes dialog already contains every useful recovery path.
 */
export function FailedImportCard({
  item,
  onTryAnotherWay,
  onRemove,
}: {
  item: QueueItem;
  onTryAnotherWay: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="recipe-page-failed__body" role="group" aria-label={`${item.source} didn't import`}>
      <p className="recipe-page-failed__heading">That recipe didn&apos;t import</p>
      <p className="recipe-page-failed__message">Try adding it from a different source.</p>

      <div className="recipe-page-failed__actions">
        <button type="button" className="btn btn-primary btn-compact" onClick={onTryAnotherWay}>
          <PlusIcon size={ICON_SIZE.md} />
          Try another way
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
    </div>
  );
}
