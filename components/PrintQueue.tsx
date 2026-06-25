"use client";

import { IMPORT_METHOD_LABEL, type QueueItem, type Recipe } from "@/types/recipe";
import {
  CheckIcon,
  ClockIcon,
  ImageIcon,
  LinkIcon,
  PlateIcon,
  RefreshIcon,
  SpinnerIcon,
  TextIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

const METHOD_ICON = {
  url: LinkIcon,
  image: ImageIcon,
  text: TextIcon,
  cookpilot: PlateIcon,
} as const;

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
}: {
  item: QueueItem;
  canRetry: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const MethodIcon = METHOD_ICON[item.method];
  const ready = item.status === "ready";
  const recipe = item.recipe;
  const selected = ready && item.selected;
  const time = totalTime(recipe);
  const servings = recipe?.servings ?? recipe?.yield;

  return (
    <li className="relative animate-fade-up">
      {/* Whole card toggles selection when the recipe is ready to print */}
      <button
        type="button"
        onClick={ready ? onToggle : undefined}
        aria-pressed={selected}
        disabled={!ready}
        className={`block w-full text-left rounded-xl overflow-hidden bg-card border shadow-card transition-all ${
          ready ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover" : "cursor-default"
        } ${selected ? "border-brand ring-2 ring-brand/30" : "border-line"}`}
      >
        {/* Cover */}
        <div className="relative aspect-[3/2] bg-gradient-to-br from-brand-50 to-teal-50 overflow-hidden">
          {recipe?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={recipe.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center text-brand/40">
              <PlateIcon size={40} />
            </div>
          )}

          {/* Parsing overlay */}
          {item.status === "parsing" && (
            <div className="absolute inset-0 grid place-items-center bg-card/70 backdrop-blur-sm">
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

          {/* Method pill */}
          <span className="absolute top-2 left-2 pill bg-card/85 backdrop-blur text-ink-soft shadow-card">
            <MethodIcon size={12} />
            {IMPORT_METHOD_LABEL[item.method]}
          </span>

          {/* Selection check */}
          {selected && (
            <span className="absolute bottom-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-brand text-white shadow-card">
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
        className="absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-full bg-card/85 backdrop-blur text-ink-soft hover:text-error shadow-card transition-colors"
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
  onSetAllSelected,
  onClear,
}: {
  items: QueueItem[];
  canRetry: (item: QueueItem) => boolean;
  onToggle: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onSetAllSelected: (selected: boolean) => void;
  onClear: () => void;
}) {
  const ready = items.filter((it) => it.status === "ready");
  const selected = ready.filter((it) => it.selected);
  const allSelected = ready.length > 0 && selected.length === ready.length;

  if (items.length === 0) {
    return (
      <div className="text-center py-cp-7 px-cp-5 rounded-2xl border border-dashed border-line-strong">
        <p className="font-bold text-[1.05rem]">No recipes added yet</p>
        <p className="text-ink-soft text-[0.9rem] mt-1.5 max-w-sm mx-auto">
          Add a recipe above and it&apos;ll show up here as a card, ready to print. Add as many
          as you want, then print them together.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-cp-4">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-x-cp-4 gap-y-cp-3">
        <div className="flex items-center gap-2 text-[0.85rem] text-ink-soft mr-auto">
          <span className="font-bold text-ink">{items.length}</span>{" "}
          {items.length === 1 ? "recipe" : "recipes"} added
          {ready.length > 0 && (
            <>
              <span className="text-line-strong">·</span>
              <span className="font-bold text-ink">{selected.length}</span> selected
            </>
          )}
        </div>

        {ready.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-compact"
            onClick={() => onSetAllSelected(!allSelected)}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
        <button type="button" className="btn-ghost btn-compact" onClick={onClear}>
          Clear all
        </button>
      </div>

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
          />
        ))}
      </ul>
    </div>
  );
}
