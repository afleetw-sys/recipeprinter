"use client";

import type { ComponentType, ReactNode } from "react";
import type { ImportSummary } from "@/lib/importSummary";
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
 * The browse-and-add list every library source shares.
 *
 * It was CookPilot's, back when CookPilot was the only library we could read.
 * Paprika needs exactly the same thing — a searchable list of recipes with an
 * Add on each row and an Add all above them — and the fastest way to get two
 * pickers that behave differently is to write the second one. So this holds
 * the list, and each source keeps only what is genuinely its own: CookPilot's
 * auth and pagination, Paprika's file.
 *
 * Everything about *loading* stays with the source. This is handed a filtered
 * list and told what to say; it does not fetch, page, or filter.
 */

function RecipeRow({
  summary,
  added,
  adding,
  fallbackIcon: FallbackIcon,
  onToggle,
}: {
  summary: ImportSummary;
  added: boolean;
  adding: boolean;
  fallbackIcon: ComponentType<{ size?: number }>;
  onToggle: () => void;
}) {
  const time = formatRecipeTime(summary.totalTimeMinutes);
  const servings = summary.servings;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={adding}
      aria-label={
        added ? `Remove ${summary.title} from print list` : `Add ${summary.title} to print list`
      }
      className={`group flex w-full items-center gap-cp-3 rounded-xl border p-cp-2 text-left transition-colors ${
        added ? "border-brand bg-brand-50/60" : "border-line bg-card hover:border-line-strong"
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
        <span className="inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-lg bg-[var(--cp-accent-warm-soft)] px-2.5 py-1.5 text-cp-caption font-bold text-ink">
          <CheckIcon size={ICON_SIZE.sm} />
          Added
        </span>
      ) : (
        <span className="btn btn-secondary btn-compact flex-shrink-0 pointer-events-none transition-colors group-hover:border-line-strong group-hover:bg-page">
          {adding ? <SpinnerIcon size={ICON_SIZE.md} /> : <PlusIcon size={ICON_SIZE.md} />}
          Add
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
  addingIds,
  bulkBusy = false,
  allVisibleAdded,
  onToggle,
  onAddAll,
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
  /** Queue ids already in the print list. */
  addedIds: Set<string>;
  /** Source ids mid-add, so their row can spin. */
  addingIds: Set<string>;
  bulkBusy?: boolean;
  allVisibleAdded: boolean;
  onToggle: (summary: ImportSummary) => void;
  onAddAll: () => void;
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

  return (
    <div className="flex flex-col gap-cp-4">
      <div className="flex items-center justify-between gap-cp-3">
        <h3 className="field-label mb-0">
          {heading}
          {countLabel ? ` ${countLabel}` : ""}
        </h3>
        {!loading && !error && summaries.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-compact flex-shrink-0"
            onClick={onAddAll}
            disabled={bulkBusy}
          >
            {bulkBusy ? <SpinnerIcon size={ICON_SIZE.sm} /> : null}
            {allVisibleAdded ? "Remove all" : "Add all"}
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
                adding={addingIds.has(summary.id)}
                fallbackIcon={fallbackIcon}
                onToggle={() => onToggle(summary)}
              />
            </li>
          ))}
        </ul>
      )}

      {footer}
    </div>
  );
}
