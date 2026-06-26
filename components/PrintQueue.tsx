"use client";

import { type QueueItem, type Recipe } from "@/types/recipe";
import {
  CheckIcon,
  ClockIcon,
  PlateIcon,
  RefreshIcon,
  SpinnerIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

function totalTime(recipe?: Recipe): string | null {
  if (!recipe) return null;
  return recipe.totalTime || recipe.cookTime || recipe.prepTime || null;
}

function RecipeCardItem({
  item,
  canRetry,
  onToggle,
  onRetry,
  onRemove,
  animate,
}: {
  item: QueueItem;
  canRetry: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onRemove: () => void;
  animate: boolean;
}) {
  const ready = item.status === "ready";
  const recipe = item.recipe;
  const selected = ready && item.selected;
  const time = totalTime(recipe);
  const servings = recipe?.servings ?? recipe?.yield;

  return (
    <li className={`relative ${animate ? "animate-fade-up" : ""}`}>
      {/* Whole card toggles selection when the recipe is ready to print */}
      <button
        type="button"
        onClick={ready ? onToggle : undefined}
        aria-pressed={selected}
        disabled={!ready}
        className={`block w-full text-left rounded-xl overflow-hidden bg-card border transition-colors ${
          ready ? "cursor-pointer hover:border-line-strong" : "cursor-default"
        } ${selected ? "border-brand" : "border-line"}`}
      >
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
            <div className="w-full h-full grid place-items-center text-brand/40">
              <PlateIcon size={40} />
            </div>
          )}

          {/* Parsing overlay */}
          {item.status === "parsing" && (
            <div className="absolute inset-0 grid place-items-center bg-card/90">
              <div className="flex flex-col items-center gap-2 text-ink-soft">
                <SpinnerIcon size={22} />
                <span className="text-[0.78rem] font-semibold">Getting recipe…</span>
              </div>
            </div>
          )}

          {/* Error overlay tint */}
          {item.status === "error" && (
            <div className="absolute inset-0 bg-[rgba(197,63,63,0.06)]" />
          )}

          {/* Selection check */}
          {selected && (
            <span className="absolute bottom-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-brand text-white">
              <CheckIcon size={16} />
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-cp-4">
          <h4 className="font-bold tracking-[-0.02em] leading-snug line-clamp-2 min-h-[2.4em]">
            {item.title}
          </h4>

          <div className="flex items-center flex-wrap gap-x-cp-4 gap-y-1 mt-2 text-[0.8rem] text-ink-soft min-h-[1.25rem]">
            {ready && time && (
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={14} />
                {time}
              </span>
            )}
            {ready && servings && (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon size={14} />
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
      </button>

      {/* Remove (overlay, above the toggle button) */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove recipe"
        title="Remove"
        className="absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-full bg-card/90 border border-line text-ink-soft hover:text-error transition-colors"
      >
        <TrashIcon size={15} />
      </button>

      {/* Error detail + retry */}
      {item.status === "error" && (
        <div className="mt-2 flex items-start gap-2 text-[0.78rem]">
          <p className="text-error flex-1 leading-snug">{item.error}</p>
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-ghost btn-compact text-brand flex-shrink-0 -mt-1.5"
            >
              <RefreshIcon size={14} />
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
  onToggle,
  onRetry,
  onRemove,
  animateItems = true,
}: {
  items: QueueItem[];
  canRetry: (item: QueueItem) => boolean;
  onToggle: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  animateItems?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-cp-7 px-cp-5 rounded-2xl border border-dashed border-line-strong">
        <p className="font-bold text-[1.05rem]">No recipes yet</p>
        <p className="text-ink-soft text-[0.9rem] mt-1.5 max-w-xs mx-auto">
          Add a recipe and it&apos;ll appear here, ready to print.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-cp-4">
      {/* Card grid */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-cp-4 items-start">
        {items.map((item) => (
          <RecipeCardItem
            key={item.id}
            item={item}
            canRetry={canRetry(item)}
            onToggle={() => onToggle(item.id)}
            onRetry={() => onRetry(item.id)}
            onRemove={() => onRemove(item.id)}
            animate={animateItems}
          />
        ))}
      </ul>
    </div>
  );
}
