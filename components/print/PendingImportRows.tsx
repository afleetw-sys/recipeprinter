import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import type { QueueItem } from "@/types/recipe";

interface PendingImportRowsProps {
  items: QueueItem[];
}

/**
 * The transient rail rows for recipes still importing. They swap out for a real
 * page once the parse lands; rendered wherever the add anchor sits in the rail.
 *
 * A FAILURE NO LONGER APPEARS HERE. It used to leave a red tile carrying the
 * error, Retry and Remove, which stayed in the rail until someone dealt with
 * it, and on a phone (which has no rail) the same failure was already a toast.
 * So a desktop cook got the news twice, in two shapes, and the rail kept a slot
 * for a recipe that was never going to arrive.
 *
 * The toast is the single answer on both. It carries the same two actions, it
 * does not time out while a failure is unresolved, and dismissing it removes
 * the dead item rather than hiding it — see the toast in app/print/page.tsx.
 */
export function PendingImportRows({ items }: PendingImportRowsProps) {
  return (
    <>
      {items
        .filter((item) => item.status === "parsing")
        .map((item) => (
          <div className="recipe-page-rail__row" data-pending-import key={`parsing-${item.id}`}>
            <div className="recipe-page-rail__item recipe-page-rail__item--loading" aria-busy>
              <div className="recipe-page-rail__item-main">
                <RecipeLoadingState className="recipe-page-rail__loading-status" />
              </div>
            </div>
          </div>
        ))}
    </>
  );
}
