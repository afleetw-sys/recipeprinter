"use client";

import { ICON_SIZE, PlusIcon, TrashIcon } from "@/components/icons";
import type { QueueItem } from "@/types/recipe";

/** Same fallback `lib/queue.ts` writes to `error` itself when a failure
    predates that field, or came from something that never went through
    `ImportError` at all. Never shown for a failure the parser can actually
    name — see `item.error` below. */
const GENERIC_MESSAGE = "We couldn't import that recipe. Check the source and try again.";

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
      {/* `item.error` is the specific, per-failure sentence `lib/parser.ts`
          already writes (rate-limited, blocked, too large, timed out, no
          recipe found, ...), each with its own actual next step. This used
          to show a single hardcoded "try a different source" here no matter
          which of those it was — right for a source that genuinely has
          nothing to read, actively wrong for "wait a bit" or "try a smaller
          photo" or "paste the text instead" cases, which are most of them. */}
      <p className="recipe-page-failed__message">{item.error || GENERIC_MESSAGE}</p>

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
