import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { importLoadingLabel } from "@/lib/importProgress";
import type { QueueItem } from "@/types/recipe";

interface PendingImportRowsProps {
  items: QueueItem[];
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
export function PendingImportRows({ items, nested = false }: PendingImportRowsProps) {
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
              <div className="recipe-page-rail__item recipe-page-rail__item--failed">
                <div className="recipe-page-rail__item-main">
                  <span className="recipe-page-rail__failed-title">
                    Couldn&apos;t import {item.source}
                  </span>
                </div>
              </div>
            </div>
          ) : (
          <div
            className={`recipe-page-rail__row ${nested ? "recipe-page-rail__row--section-child" : ""}`}
            data-pending-import
            key={`parsing-${item.id}`}
          >
            <div className="recipe-page-rail__item recipe-page-rail__item--loading" aria-busy>
              <div className="recipe-page-rail__item-main">
                <RecipeLoadingState
                  className="recipe-page-rail__loading-status"
                  label={importLoadingLabel(item)}
                />
              </div>
            </div>
          </div>
          ),
        )}
    </>
  );
}
