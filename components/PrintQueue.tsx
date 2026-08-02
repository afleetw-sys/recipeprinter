"use client";

import { useEffect, useRef } from "react";
import { formatRecipeTime } from "@/lib/time";
import { type QueueItem, type Recipe } from "@/types/recipe";
import {
  ClockIcon,
  ICON_SIZE,
  RefreshIcon,
  SpinnerIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";
import { LogoImage } from "@/components/Logo";

function totalTime(recipe?: Recipe): string | null {
  if (!recipe) return null;
  return formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime);
}

function RecipeCardItem({
  item,
  canRetry,
  onRetry,
  onRemove,
  animate,
  focused,
}: {
  item: QueueItem;
  canRetry: boolean;
  onRetry: () => void;
  onRemove: () => void;
  animate: boolean;
  focused: boolean;
}) {
  const itemRef = useRef<HTMLLIElement | null>(null);
  const ready = item.status === "ready";
  const recipe = item.recipe;
  const time = totalTime(recipe);
  const servings = recipe?.servings ?? recipe?.yield;

  useEffect(() => {
    if (!focused) return;
    itemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  return (
    <li
      ref={itemRef}
      className={`relative ${animate ? "animate-fade-up" : ""} ${
        focused ? "rp-queue-item--focused" : ""
      }`}
    >
      <div className="block w-full text-left rounded-xl overflow-hidden bg-card border border-line">
        {/* Cover */}
        <div className="relative aspect-[3/2] bg-page overflow-hidden">
          {recipe?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full grid place-items-center opacity-40">
              <LogoImage size={40} />
            </div>
          )}

          {/* Parsing overlay */}
          {item.status === "parsing" && (
            <div className="absolute inset-0 grid place-items-center bg-card/90">
              <div className="flex flex-col items-center gap-2 text-ink-soft">
                <SpinnerIcon size={22} />
                <span className="text-cp-caption font-semibold">Getting recipe…</span>
              </div>
            </div>
          )}

          {/* Error overlay tint */}
          {item.status === "error" && (
            <div className="absolute inset-0 bg-[var(--cp-error-soft)]" />
          )}
        </div>

        {/* Body */}
        <div className="p-cp-4">
          <h4 className="text-cp-body font-bold tracking-[-0.02em] leading-snug line-clamp-2 min-h-[2.4em]">
            {item.title}
          </h4>

          <div className="flex items-center flex-wrap gap-x-cp-4 gap-y-1 mt-2 text-cp-caption text-ink-soft min-h-[1.25rem]">
            {ready && time && (
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={ICON_SIZE.sm} />
                {time}
              </span>
            )}
            {ready && servings && (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon size={ICON_SIZE.sm} />
                {String(servings)}
              </span>
            )}
            {ready && !time && !servings && recipe && (
              <span>
                {recipe.ingredients.length} ingredients · {recipe.instructions.length} steps
              </span>
            )}
            {item.status === "parsing" && <span className="truncate">{item.source}</span>}
            {item.status === "error" && (
              <span className="text-error font-semibold">Couldn&apos;t parse</span>
            )}
          </div>
        </div>
      </div>

      {/* Remove (overlay, above the toggle button) */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove recipe"
        title="Remove"
        className="absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-full bg-card/90 border border-line text-ink-soft hover:text-error transition-colors"
      >
        <TrashIcon size={ICON_SIZE.md} />
      </button>

      {/* Error detail + retry */}
      {item.status === "error" && (
        <div className="mt-2 flex items-start gap-2 text-cp-caption">
          <p className="text-error flex-1 leading-snug">{item.error}</p>
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-ghost btn-compact text-brand-ink flex-shrink-0 -mt-1.5"
            >
              <RefreshIcon size={ICON_SIZE.sm} />
              Retry
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function PrintQueue({
  items,
  canRetry,
  onRetry,
  onRemove,
  animateItems = true,
  focusedItemId,
}: {
  items: QueueItem[];
  canRetry: (item: QueueItem) => boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  animateItems?: boolean;
  focusedItemId?: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="rp-print-queue-empty text-center py-cp-7 px-cp-5 rounded-2xl border border-dashed border-line-strong">
        <p className="font-bold text-cp-h2">No recipes yet</p>
        <p className="text-ink-soft text-cp-small mt-1.5 max-w-xs mx-auto">
          Add a recipe and it&apos;ll appear here, ready to print.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-cp-4">
      {/* Card grid */}
      <ul className="grid grid-cols-2 lg:grid-cols-3 gap-cp-4 items-start">
        {items.map((item) => (
          <RecipeCardItem
            key={item.id}
            item={item}
            canRetry={canRetry(item)}
            onRetry={() => onRetry(item.id)}
            onRemove={() => onRemove(item.id)}
            animate={animateItems}
            focused={focusedItemId === item.id}
          />
        ))}
      </ul>
    </div>
  );
}
