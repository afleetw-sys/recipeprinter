"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Recipe } from "@/types/recipe";
import type { RecipeChoice } from "@/lib/recipeChoice";
import { filterImportSummaries, importSearchText, type ImportSummary } from "@/lib/importSummary";
import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/Controls";
import { RecipeSourceList } from "@/components/import/RecipeSourceList";
import { MobileSheet } from "@/components/print/MobileSheet";
import { BookIcon, CrownIcon, ICON_SIZE, PlusIcon, SpinnerIcon, XIcon } from "@/components/icons";

/** Past this many, the list gets a search box. Fewer read at a glance. */
const SEARCH_FROM = 9;

const WHERE: Record<RecipeChoice["source"], string> = {
  url: "on that page",
  image: "in that photo",
  text: "in that text",
};

/** "45 min" style times are written as text on a parsed recipe; the row
    wants minutes. Only the plain forms are read, the rest are left off. */
function minutesOf(time: string | undefined): number | undefined {
  if (!time) return undefined;
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(time.trim());
  if (iso && (iso[1] || iso[2])) return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0);
  const hours = /(\d+)\s*h/i.exec(time);
  const mins = /(\d+)\s*m/i.exec(time);
  if (!hours && !mins) return undefined;
  return Number(hours?.[1] ?? 0) * 60 + Number(mins?.[1] ?? 0);
}

function summaryOf(recipe: Recipe, index: number): ImportSummary {
  return {
    id: String(index),
    queueId: String(index),
    title: recipe.title || "Untitled recipe",
    imageURL: recipe.image,
    servings: recipe.servings,
    totalTimeMinutes: minutesOf(recipe.totalTime),
    searchText: importSearchText(recipe.title, ...recipe.ingredients.map((line) => line.raw)),
  };
}

/**
 * Which of the recipes one import found to add, when the account can't take
 * them all: one on the free plan, the free preview's room in an unbought
 * cookbook (lib/recipeChoice). A roundup link, or any photo or paste the
 * parser reads as several.
 *
 * It starts with what fits already ticked, so the common case is one press,
 * and it offers the way to all of them beside the Add button: Pro, or buying
 * the cookbook. Either one adds every recipe here once it goes through,
 * without importing anything again (the page's `recipeChoice` effect).
 *
 * The same list the recipe apps use, so choosing from a link and choosing from
 * Paprika look and work alike. Nothing is counted until the cook adds: closing
 * this settles the import as a failure (see `addChosenRecipes`).
 */
export function FoundRecipesDialog({
  choice,
  limit,
  cookbook,
  bookPrice,
  busy = false,
  phone = false,
  onAdd,
  onCancel,
  onGetAll,
}: {
  choice: RecipeChoice;
  /** The most that can be added: 1 on the free plan, the preview's room in
      an unbought cookbook. Always fewer than were found. */
  limit: number;
  cookbook: boolean;
  /** The cookbook's price as shown at checkout, e.g. "$15.99". */
  bookPrice?: string;
  /** Buying the cookbook is under way. */
  busy?: boolean;
  /** A phone: a bottom sheet with one Add, instead of a dialog. */
  phone?: boolean;
  onAdd: (recipes: Recipe[]) => void;
  onCancel: () => void;
  /** Pro on the free plan, buying the book in a cookbook. */
  onGetAll: () => void;
}) {
  const summaries = useMemo(() => choice.recipes.map(summaryOf), [choice.recipes]);
  const count = choice.recipes.length;
  const fits = Math.min(limit, count);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(summaries.slice(0, fits).map((summary) => summary.queueId)),
  );
  const [queryText, setQueryText] = useState("");
  // Mounted closed, then opened, so the sheet slides up like the phone's
  // other sheets instead of appearing in place.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSheetOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const singleSelect = limit === 1;
  // Said only once the cook tries to tick past the room: the ones ticked at
  // the start already fill it, and saying so before anything is tried reads
  // as a warning about nothing.
  const [triedPastLimit, setTriedPastLimit] = useState(false);
  const full = !singleSelect && triedPastLimit && selectedIds.size >= limit;

  function toggle(summary: ImportSummary) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(summary.queueId)) {
        next.delete(summary.queueId);
        return next;
      }
      // One at a time: picking another swaps it in.
      if (singleSelect) return new Set([summary.queueId]);
      if (next.size >= limit) {
        setTriedPastLimit(true);
        return current;
      }
      next.add(summary.queueId);
      return next;
    });
  }

  const allSelected = selectedIds.size >= fits;
  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(summaries.slice(0, fits).map((summary) => summary.queueId)),
    );
  }

  function add() {
    // In the page's order, whatever order they were ticked in.
    onAdd(choice.recipes.filter((_, index) => selectedIds.has(String(index))));
  }

  const chosen = selectedIds.size;
  const thumbnails = choice.recipes.some((recipe) => Boolean(recipe.image));
  const titleText = `We found ${count} recipes ${WHERE[choice.source]}`;
  const addLabel = chosen <= 1 ? "Add recipe" : `Add ${chosen} recipes`;
  const getAllLabel = cookbook
    ? `Get the full cookbook${bookPrice ? ` · ${bookPrice}` : ""}`
    : `Get all ${count} with Pro`;

  // What the limit is and what to do about it. The way to all of them isn't
  // in the sentence: it's its own control right under or beside Add.
  const explanation = (
    <div className="flex flex-col gap-cp-1 text-cp-body leading-relaxed text-ink-soft">
      <p>
        {cookbook
          ? `Your free preview has room for ${singleSelect ? "one more recipe" : `${limit} more recipes`}. Pick ${
              singleSelect ? "the one" : "the ones"
            } you want.`
          : "The free plan adds one recipe at a time. Pick the one you want."}
      </p>
      {choice.metered && <p className="text-cp-caption">It only counts toward your free imports once you add it.</p>}
      {full && (
        <p className="text-cp-caption font-bold text-ink" role="status">
          {"That's all the room your free preview has."}
        </p>
      )}
    </div>
  );

  const list = (footer?: ReactNode) => (
    <RecipeSourceList
      heading="Recipes"
      countLabel={`(${count})`}
      summaries={filterImportSummaries(summaries, queryText)}
      addedIds={new Set()}
      selectedIds={selectedIds}
      allSelectableSelected={allSelected}
      onToggle={toggle}
      onToggleAll={toggleAll}
      onCommit={add}
      commitLabel=""
      hideCommit
      queryText={queryText}
      onQueryChange={setQueryText}
      searchable={count >= SEARCH_FROM}
      searchLabel="Search the recipes we found"
      searchId="found-recipes-search"
      fallbackIcon={BookIcon}
      thumbnails={thumbnails}
      showMeta={!phone}
      singleSelect={singleSelect}
      footer={footer}
    />
  );

  if (phone) {
    // A sheet, like the phone's own Add menu: a quick question about what was
    // just added, not a screen of its own. One full-width Add, and the way to
    // all of them as a quiet button under it, so the two never compete.
    return (
      <MobileSheet
        open={sheetOpen}
        onClose={() => {
          if (!busy) onCancel();
        }}
        title={titleText}
        className="found-recipes-sheet"
        portal
        footer={
          <div className="flex w-full flex-col items-stretch gap-cp-2">
            <button type="button" className="btn btn-primary" disabled={chosen === 0 || busy} onClick={add}>
              <PlusIcon size={ICON_SIZE.md} />
              {addLabel}
            </button>
            {/* Secondary, stacked under Add: below it, the two read as first
                and second choice rather than competing side by side. */}
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onGetAll}>
              {busy ? (
                <SpinnerIcon size={ICON_SIZE.md} />
              ) : (
                <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
              )}
              {getAllLabel}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-cp-3 px-cp-1 pb-cp-2">
          {explanation}
          {list()}
        </div>
      </MobileSheet>
    );
  }

  return (
    <Dialog
      onClose={onCancel}
      closeDisabled={busy}
      labelledBy="found-recipes-title"
      className="fixed inset-0 z-[var(--z-dialog)] grid place-items-center dialog-scrim p-cp-4"
      // No bottom padding: the buttons are pinned to the bottom of this
      // scroller, and padding under them showed a sliver of list row through
      // the gap (the same fix as `.recipe-add-dialog__body`). The bar has its own.
      panelClassName="relative flex max-h-[min(44rem,90dvh)] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-line bg-card px-cp-6 pb-0 pt-cp-6 shadow-cp-lg"
      portal
    >
      <IconButton className="absolute right-3 top-3" aria-label="Close" disabled={busy} onClick={onCancel}>
        <XIcon size={ICON_SIZE.md} />
      </IconButton>
      <h2 id="found-recipes-title" className="pr-10 text-cp-dialog-title font-bold tracking-tight">
        {titleText}
      </h2>
      <div className="mb-cp-4 mt-cp-2">{explanation}</div>
      {list(
        // The way to all of them sits beside Add: it's the other answer to
        // this dialog, so it's a button like the first.
        <div className="import-source-commit flex justify-end gap-cp-2">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onGetAll}>
            {busy ? (
              <SpinnerIcon size={ICON_SIZE.md} />
            ) : (
              <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
            )}
            {getAllLabel}
          </button>
          <button type="button" className="btn btn-primary" disabled={chosen === 0 || busy} onClick={add}>
            <PlusIcon size={ICON_SIZE.md} />
            {addLabel}
          </button>
        </div>,
      )}
    </Dialog>
  );
}
