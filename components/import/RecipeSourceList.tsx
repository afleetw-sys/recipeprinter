"use client";

import type { ComponentType, ReactNode } from "react";
import type { ImportSummary } from "@/lib/importSummary";
import { addSelectedLabel } from "@/lib/importSelection";
import { formatRecipeTime } from "@/lib/time";
import { EmptyState } from "@/components/EmptyState";
import {
  CheckIcon,
  ClockIcon,
  ICON_SIZE,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  UsersIcon,
} from "@/components/icons";

/**
 * The browse-and-choose list every library source shares.
 *
 * It was CookPilot's, back when CookPilot was the only library we could read.
 * Paprika needs exactly the same thing — a searchable list of recipes you tick
 * and then add — and the fastest way to get two pickers that behave
 * differently is to write the second one. So this holds the list, and each
 * source keeps only what is genuinely its own: CookPilot's auth and
 * pagination, Paprika's file.
 *
 * Everything about *loading* stays with the source. This is handed a filtered
 * list and told what to say; it does not fetch, page, or filter.
 *
 * Ticking a row is local and instant (see lib/importSelection) — the print
 * list is written once, by the button at the bottom. A row already in the
 * print list says so and cannot be ticked: it is in, and the place it comes
 * back out is the print page.
 */

function RecipeRow({
  summary,
  added,
  selected,
  fallbackIcon: FallbackIcon,
  onToggle,
}: {
  summary: ImportSummary;
  added: boolean;
  selected: boolean;
  fallbackIcon: ComponentType<{ size?: number }>;
  onToggle: () => void;
}) {
  const time = formatRecipeTime(summary.totalTimeMinutes);
  const servings = summary.servings;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={added || selected}
      aria-disabled={added || undefined}
      disabled={added}
      onClick={onToggle}
      aria-label={
        added
          ? `${summary.title} is already in your print list`
          : selected
            ? `Don't add ${summary.title}`
            : `Add ${summary.title}`
      }
      className={`group flex w-full items-center gap-cp-3 rounded-xl border p-cp-2 text-left transition-colors ${
        selected
          ? "border-[var(--cp-selected-border)] bg-[var(--cp-selected-fill)] text-[var(--cp-selected-text)]"
          : added
            ? "border-line bg-page"
            : "border-line bg-card hover:border-line-strong"
      }`}
    >
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-page grid place-items-center text-brand/50">
        {summary.imageURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={summary.imageURL}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <FallbackIcon size={22} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-cp-body font-bold leading-snug line-clamp-1">{summary.title}</p>
        {(time || servings) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-cp-3 gap-y-0.5 text-cp-caption text-ink-soft">
            {time && (
              <span className="inline-flex items-center gap-1">
                <ClockIcon size={ICON_SIZE.sm} />
                {time}
              </span>
            )}
            {servings && (
              <span className="inline-flex items-center gap-1">
                <UsersIcon size={ICON_SIZE.sm} />
                Serves {servings}
              </span>
            )}
          </p>
        )}
      </div>

      {added ? (
        <span className="inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-lg bg-[var(--cp-accent-soft)] px-2.5 py-1.5 text-cp-caption font-bold text-ink">
          <CheckIcon size={ICON_SIZE.sm} />
          Added
        </span>
      ) : (
        /* A tickbox, because that is what it now is. The row still reads as a
           whole control — the box is the mark, not the hit area. */
        <span
          aria-hidden
          className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-md border transition-colors ${
            selected
              ? "border-[var(--cp-selected-border)] bg-[var(--cp-selected-border)] text-card"
              : "border-line-strong bg-card group-hover:bg-page"
          }`}
        >
          {selected && <CheckIcon size={ICON_SIZE.sm} />}
        </span>
      )}
    </button>
  );
}

export function RecipeSourceList({
  heading,
  countLabel,
  summaries,
  addedIds,
  selectedIds,
  allSelectableSelected,
  onToggle,
  onToggleAll,
  selectAllBusy = false,
  onCommit,
  committing = false,
  queryText,
  onQueryChange,
  searchId,
  searchLabel,
  loading = false,
  loadingLabel,
  error,
  emptyState,
  showNoMatches = true,
  fallbackIcon,
  footer,
}: {
  heading: string;
  /** e.g. "(120+)" — the source knows whether it has seen its whole library. */
  countLabel?: string;
  /** Already filtered by `queryText`; this list renders what it is given. */
  summaries: ImportSummary[];
  /** Queue ids already in the print list. Shown as such, not selectable. */
  addedIds: Set<string>;
  /** Queue ids ticked but not yet added. */
  selectedIds: Set<string>;
  /** Whether every still-addable visible row is ticked. */
  allSelectableSelected: boolean;
  onToggle: (summary: ImportSummary) => void;
  onToggleAll: () => void;
  /** CookPilot's "Select all" may have to fetch the rest of the library first. */
  selectAllBusy?: boolean;
  onCommit: () => void;
  committing?: boolean;
  queryText: string;
  onQueryChange: (value: string) => void;
  searchId: string;
  searchLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  /** Shown when the source has nothing at all — each one says something
      different about how to get recipes into it. */
  emptyState?: ReactNode;
  /** False while more of the library is still arriving — an empty search
      result isn't "no matches" yet if half the library hasn't loaded. */
  showNoMatches?: boolean;
  fallbackIcon: ComponentType<{ size?: number }>;
  /** Anything that belongs under the list: CookPilot's paging sentinel and its
      "Loading more" line. */
  footer?: ReactNode;
}) {
  const isSearching = queryText.trim().length > 0;
  const selectedCount = selectedIds.size;
  // Nothing addable left to select, so the control has nothing to offer.
  const canSelectAll =
    allSelectableSelected || summaries.some((summary) => !addedIds.has(summary.queueId));

  return (
    <div className="flex flex-col gap-cp-4">
      <div className="flex items-center justify-between gap-cp-3">
        <h3 className="field-label mb-0">
          {heading}
          {countLabel ? ` ${countLabel}` : ""}
        </h3>
        {!loading && !error && summaries.length > 0 && canSelectAll && (
          <button
            type="button"
            className="btn-ghost btn-compact flex-shrink-0"
            onClick={onToggleAll}
            disabled={selectAllBusy || committing}
          >
            {selectAllBusy ? <SpinnerIcon size={ICON_SIZE.sm} /> : null}
            {allSelectableSelected ? "Clear selection" : "Select all"}
          </button>
        )}
      </div>

      <div className="relative">
        <SearchIcon
          size={ICON_SIZE.lg}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
        />
        <input
          id={searchId}
          className="field !pl-11"
          placeholder="Search your recipes..."
          aria-label={searchLabel}
          value={queryText}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      {loading && (
        <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon size={ICON_SIZE.lg} />
            {loadingLabel ?? "Loading your recipes"}
          </span>
        </div>
      )}

      {!loading && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && summaries.length === 0 && !isSearching && emptyState}

      {!loading && !error && summaries.length === 0 && isSearching && showNoMatches && (
        <EmptyState title="No matches" description="Try a different title, tag, or ingredient." />
      )}

      {!loading && !error && summaries.length > 0 && (
        <ul className="import-recipe-list flex flex-col gap-cp-2">
          {summaries.map((summary) => (
            <li key={summary.queueId}>
              <RecipeRow
                summary={summary}
                added={addedIds.has(summary.queueId)}
                selected={selectedIds.has(summary.queueId)}
                fallbackIcon={fallbackIcon}
                onToggle={() => onToggle(summary)}
              />
            </li>
          ))}
        </ul>
      )}

      {footer}

      {/* The one write. It stays on screen with nothing ticked so the picker
          always shows how choosing here ends, rather than growing a button the
          first time you tick something. A selection made under a search
          survives clearing that search, so the count can exceed what is on
          screen — which is why it names a number and not "these". */}
      {!loading && (selectedCount > 0 || summaries.length > 0) && (
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={onCommit}
          disabled={selectedCount === 0 || committing}
        >
          {committing ? <SpinnerIcon size={ICON_SIZE.md} /> : <PlusIcon size={ICON_SIZE.md} />}
          {addSelectedLabel(selectedCount)}
        </button>
      )}
    </div>
  );
}
