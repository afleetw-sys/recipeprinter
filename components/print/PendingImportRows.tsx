import { AlertIcon, ICON_SIZE } from "@/components/icons";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { importLoadingLabel } from "@/lib/importProgress";
import type { QueueItem } from "@/types/recipe";

interface PendingImportRowsProps {
  items: QueueItem[];
  /** Scrolls the deck to this import's card. */
  onSelect: (item: QueueItem) => void;
  /** The import whose card the deck is showing. */
  activeId?: string | null;
  /**
   * The row these hang under belongs to a titled section, so the spinner takes
   * the section's nesting line too.
   *
   * Without it the line stopped at the recipe above and picked up again at the
   * one below, because it is drawn per-row (`--section-child::before`) and a
   * pending row is a sibling of the row it follows, not a child of it. A recipe
   * still importing INTO a chapter looked like it was landing outside it.
   */
  nested?: boolean;
}

/**
 * The transient rail rows for recipes still importing. They swap out for a real
 * page once the parse lands; rendered wherever the add anchor sits in the rail.
 *
 * A FAILURE APPEARS HERE TOO, as a row that names it and nothing more. The
 * news is in two places on a desktop, but not in two shapes: the row is a
 * label and the answer is on the page it points at, the same way every other
 * rail row is a label for a page. What this replaces is a toast that was the
 * ONLY record of the failure, expired on a timer, and on a phone (which has no
 * rail) was the only thing that ever mentioned the import at all.
 *
 * The actions — Try again, paste the text, add a screenshot, remove — live on
 * the card, which has the room for them. See FailedImportCard.
 */
export function PendingImportRows({
  items,
  onSelect,
  activeId,
  nested = false,
}: PendingImportRowsProps) {
  return (
    <>
      {items
        .filter((item) => item.status === "parsing" || item.status === "error")
        .map((item) =>
          item.status === "error" ? (
            <div
              className={`recipe-page-rail__row ${nested ? "recipe-page-rail__row--section-child" : ""}`}
              data-failed-import
              key={`failed-${item.id}`}
            >
              {/* A button, like every other rail row. These two used to be the
                  only inert rows in the rail: the deck scrolls to a failure
                  when it happens, but scroll away and there was no way back to
                  read it, which is the one row where the page it points at is
                  the only place the news exists. */}
              <div
                className={`recipe-page-rail__item recipe-page-rail__item--failed ${
                  activeId === item.id ? "is-active" : ""
                }`}
              >
                <button
                  type="button"
                  className="recipe-page-rail__item-main"
                  aria-current={activeId === item.id}
                  onClick={() => onSelect(item)}
                >
                  <AlertIcon
                    size={ICON_SIZE.lg}
                    className="recipe-page-rail__failed-icon"
                    aria-hidden
                  />
                  <span className="recipe-page-rail__failed-title">
                    Couldn&apos;t import {item.source}
                  </span>
                </button>
              </div>
            </div>
          ) : (
          <div
            className={`recipe-page-rail__row ${nested ? "recipe-page-rail__row--section-child" : ""}`}
            data-pending-import
            key={`parsing-${item.id}`}
          >
            <div
              className={`recipe-page-rail__item recipe-page-rail__item--loading ${
                activeId === item.id ? "is-active" : ""
              }`}
              aria-busy
            >
              <button
                type="button"
                // The same centred stack the failed row uses; the loading
                // state paints itself inside it.
                className="recipe-page-rail__item-main"
                aria-current={activeId === item.id}
                onClick={() => onSelect(item)}
              >
                <RecipeLoadingState
                  className="recipe-page-rail__loading-status"
                  label={importLoadingLabel(item)}
                />
              </button>
            </div>
          </div>
          ),
        )}
    </>
  );
}
