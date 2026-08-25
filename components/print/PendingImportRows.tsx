"use client";

import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import type { QueueItem } from "@/types/recipe";

interface PendingImportRowsProps {
  items: QueueItem[];
  canRetry: (item: QueueItem) => boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * The transient rail rows for recipes still importing (a spinner) or that
 * failed to import (an inline error with Retry / Remove). They swap out for a
 * real page once the parse lands; rendered wherever the add anchor sits in the
 * rail.
 */
export function PendingImportRows({ items, canRetry, onRetry, onRemove }: PendingImportRowsProps) {
  return (
    <>
      {items.map((item) => (
        <div className="recipe-page-rail__row" data-pending-import key={`parsing-${item.id}`}>
          <div
            className={`recipe-page-rail__item ${
              item.status === "error" ? "recipe-page-rail__item--error" : "recipe-page-rail__item--loading"
            }`}
            aria-busy={item.status === "parsing"}
          >
            <div className="recipe-page-rail__item-main">
              {item.status === "parsing" ? (
                <RecipeLoadingState className="recipe-page-rail__loading-status" />
              ) : (
                <div className="recipe-page-rail__import-error" role="alert">
                  {/* "recipe" was doing nothing: the sentence under it says so,
                      and the tile sits in a rail of recipes. */}
                  <strong>Couldn&apos;t import</strong>
                  {/* Clamped to two lines in the rail; the full message stays
                      reachable rather than truncated away. */}
                  <span title={item.error || undefined}>
                    {item.error || "Check the source and try again."}
                  </span>
                  <div className="recipe-page-rail__import-error-actions">
                    {canRetry(item) && (
                      <button type="button" className="btn btn-secondary btn-compact" onClick={() => onRetry(item.id)}>
                        Retry
                      </button>
                    )}
                    {/* Plain ghost, not the danger tier: nothing is lost by
                        dismissing an import that never produced anything, and a
                        second red on an already-red tile is noise, not warning. */}
                    <button type="button" className="btn btn-ghost btn-compact" onClick={() => onRemove(item.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
