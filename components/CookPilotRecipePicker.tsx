"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { friendlyAuthError, friendlyRecipeLibraryError } from "@/lib/friendlyErrors";
import { formatRecipeTime } from "@/lib/time";
import {
  appleProvider,
  CookPilotLoginDialog,
  googleProvider,
  signInWithCookPilotProvider,
  useCookPilotAuth,
} from "@/components/CookPilotAuth";
import {
  cookPilotQueueId,
  filterCookPilotSummaries,
  getCachedCookPilotSummaries,
  hasMoreCookPilotSummaries,
  loadAllCookPilotRecipeSummaries,
  loadCookPilotQueueItems,
  loadCookPilotRecipeSummaries,
  loadMoreCookPilotRecipeSummaries,
  type CookPilotRecipeSummary,
} from "@/lib/cookpilotRecipes";
import type { QueueItem } from "@/types/recipe";
import { EmptyState } from "@/components/EmptyState";
import {
  CheckIcon,
  ClockIcon,
  CookPilotLogoIcon,
  ExternalIcon,
  ICON_SIZE,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  UsersIcon,
} from "@/components/icons";

function SignedOutCookPilotImport({
  onEmailLogin,
  redirectError,
}: {
  onEmailLogin: () => void;
  redirectError: string | null;
}) {
  const [busyProvider, setBusyProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = busyProvider !== null;

  async function handleGoogle() {
    setBusyProvider("google");
    setError(null);
    try {
      await signInWithCookPilotProvider(googleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
      setBusyProvider(null);
    }
  }

  async function handleApple() {
    setBusyProvider("apple");
    setError(null);
    try {
      await signInWithCookPilotProvider(appleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Apple. Please try again."));
      setBusyProvider(null);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-cp-6 text-center bg-card">
      <div className="mx-auto w-12 h-12 rounded-xl bg-page grid place-items-center text-ink">
        <CookPilotLogoIcon size={24} />
      </div>
      <h3 className="font-extrabold tracking-[-0.02em] text-cp-h2 mt-cp-4">
        Import from{" "}
        <a
          href="https://app.cookpilotapp.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-current underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          CookPilot
          <ExternalIcon size={ICON_SIZE.sm} />
        </a>
      </h3>
      <p className="text-cp-small text-ink-soft mt-1 max-w-sm mx-auto">
        Sign in to add your saved CookPilot recipes straight to this print list.
      </p>
      <div className="flex flex-wrap justify-center gap-cp-3 mt-cp-5">
        <button type="button" className="btn btn-primary" onClick={onEmailLogin} disabled={busy}>
          Continue with Email
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleGoogle} disabled={busy}>
          {busyProvider === "google" ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
          Continue with Google
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleApple} disabled={busy}>
          {busyProvider === "apple" ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
          Continue with Apple
        </button>
      </div>
      {(error ?? redirectError) && (
        <div className="state state--error mt-cp-4 text-left" role="alert">
          <h4>Couldn&apos;t sign in</h4>
          <p>{error ?? redirectError}</p>
        </div>
      )}
    </div>
  );
}

function RecipeRow({
  summary,
  added,
  adding,
  onToggle,
}: {
  summary: CookPilotRecipeSummary;
  added: boolean;
  adding: boolean;
  onToggle: () => void;
}) {
  const time = formatRecipeTime(summary.totalTimeMinutes);
  const servings = summary.preferredServings ?? summary.servings;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={adding}
      aria-label={
        added
          ? `Remove ${summary.title} from print list`
          : `Add ${summary.title} to print list`
      }
      className={`group flex w-full items-center gap-cp-3 rounded-xl border p-cp-2 text-left transition-colors ${
        added
          ? "border-brand bg-brand-50/60 shadow-[var(--cp-selected-ring)]"
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
          <CookPilotLogoIcon size={22} />
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
        <span className="inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-cp-caption font-bold text-brand-ink">
          <CheckIcon size={ICON_SIZE.sm} />
          Added
        </span>
      ) : (
        <span className="btn btn-secondary btn-compact flex-shrink-0 pointer-events-none transition-colors group-hover:border-line-strong group-hover:bg-[rgba(127,127,127,0.08)]">
          {adding ? <SpinnerIcon size={ICON_SIZE.md} /> : <PlusIcon size={ICON_SIZE.md} />}
          Add
        </span>
      )}
    </button>
  );
}

function SignedInCookPilotImport({
  user,
  items,
  onAddRecipes,
  onRemoveRecipe,
}: {
  user: User;
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  const [summaries, setSummaries] = useState<CookPilotRecipeSummary[]>(
    () => getCachedCookPilotSummaries(user.uid) ?? [],
  );
  const [queryText, setQueryText] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(() => getCachedCookPilotSummaries(user.uid) === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => hasMoreCookPilotSummaries(user.uid));
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const isSearching = queryText.trim().length > 0;
  // True until the component actually unmounts (or switches users) — a
  // component-level ref rather than a `let alive = true` local to each
  // effect, because the infinite-scroll effect below depends on `loadingMore`
  // (so it can re-arm the observer once a page finishes loading), and that
  // same state is also what `loadNextPage` sets to *start* a fetch. With a
  // per-invocation local, setting it flips that dependency, which reruns the
  // effect and fires its cleanup — tearing down the very `alive` flag the
  // in-flight fetch this just kicked off is still relying on. Its `.then()`
  // and `.finally()` would see `alive === false` and silently skip applying
  // the results and resetting `loadingMore`, leaving the list stuck on the
  // spinner forever with nothing new loaded. A ref shared across the
  // component's lifetime isn't affected by any single effect's own cleanup.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, [user.uid]);

  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const visibleSummaries = useMemo(
    () => filterCookPilotSummaries(summaries, queryText),
    [summaries, queryText],
  );
  const visibleNotAdded = useMemo(
    () => visibleSummaries.filter((summary) => !addedIds.has(cookPilotQueueId(summary.id))),
    [visibleSummaries, addedIds],
  );
  const allVisibleAdded = visibleSummaries.length > 0 && visibleNotAdded.length === 0;

  useEffect(() => {
    // Already cached from an earlier visit: state is seeded, skip the fetch.
    if (getCachedCookPilotSummaries(user.uid)) return;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    loadCookPilotRecipeSummaries(user.uid)
      .then((nextSummaries) => {
        if (aliveRef.current) {
          setSummaries(nextSummaries);
          setHasMore(hasMoreCookPilotSummaries(user.uid));
        }
      })
      .catch((err) => {
        if (aliveRef.current) {
          setError(friendlyRecipeLibraryError(err, "Couldn't load your recipes."));
        }
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false);
      });
  }, [user.uid]);

  // Search needs to match the whole library, not just whatever's been
  // scrolled into view so far — the first keystroke loads every remaining
  // page in the background (subsequent keystrokes no-op once it's all in).
  useEffect(() => {
    if (!isSearching || !hasMoreCookPilotSummaries(user.uid)) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    loadAllCookPilotRecipeSummaries(user.uid)
      .then((all) => {
        if (!aliveRef.current) return;
        setSummaries(all);
        setHasMore(false);
      })
      .catch((err) => {
        if (aliveRef.current) setError(friendlyRecipeLibraryError(err, "Couldn't load more recipes."));
      })
      .finally(() => {
        if (aliveRef.current) setLoadingMore(false);
      });
  }, [isSearching, user.uid]);

  // Infinite scroll for normal browsing (not while search is loading the
  // full library above) — loads the next page once the sentinel at the
  // bottom of the list scrolls into view. Deliberately doesn't gate a fetch
  // already in flight on `aliveRef` the way the effect cleanup below gates
  // the observer — see `aliveRef`'s own comment above for why: this effect
  // depends on `loadingMore` (needed to re-arm the observer once each page
  // finishes), and `loadNextPage` is what sets `loadingMore` true, so tying
  // its own completion to this effect's cleanup would tear down the very
  // flag the fetch it just started depends on.
  useEffect(() => {
    if (isSearching || loading || loadingMore || loadMoreError || !hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    function loadNextPage() {
      setLoadingMore(true);
      setLoadMoreError(null);
      loadMoreCookPilotRecipeSummaries(user.uid)
        .then((next) => {
          if (!aliveRef.current) return;
          setSummaries(next);
          setHasMore(hasMoreCookPilotSummaries(user.uid));
        })
        .catch((err) => {
          if (aliveRef.current) setLoadMoreError(friendlyRecipeLibraryError(err, "Couldn't load more recipes."));
        })
        .finally(() => {
          if (aliveRef.current) setLoadingMore(false);
        });
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        loadNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [user.uid, isSearching, loading, loadingMore, loadMoreError, hasMore]);

  function retryLoadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    loadMoreCookPilotRecipeSummaries(user.uid)
      .then((next) => {
        setSummaries(next);
        setHasMore(hasMoreCookPilotSummaries(user.uid));
      })
      .catch((err) => {
        setLoadMoreError(friendlyRecipeLibraryError(err, "Couldn't load more recipes."));
      })
      .finally(() => setLoadingMore(false));
  }

  async function handleToggle(summary: CookPilotRecipeSummary) {
    const queueId = cookPilotQueueId(summary.id);
    if (addingIds.has(summary.id)) return;
    if (addedIds.has(queueId)) {
      onRemoveRecipe(queueId);
      return;
    }
    setError(null);
    setAddingIds((current) => new Set(current).add(summary.id));
    try {
      const queueItems = await loadCookPilotQueueItems(user.uid, [summary]);
      onAddRecipes(queueItems);
    } catch (err) {
      setError(friendlyRecipeLibraryError(err, "Couldn't add that recipe."));
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(summary.id);
        return next;
      });
    }
  }

  async function handleAddAll() {
    if (bulkBusy) return;
    if (allVisibleAdded) {
      visibleSummaries.forEach((summary) => onRemoveRecipe(cookPilotQueueId(summary.id)));
      return;
    }
    setError(null);
    setBulkBusy(true);
    try {
      // "Add all" means the whole library, not just whatever's been scrolled
      // into view so far — load any remaining pages first if needed.
      let allSummaries = summaries;
      if (hasMoreCookPilotSummaries(user.uid)) {
        allSummaries = await loadAllCookPilotRecipeSummaries(user.uid);
        setSummaries(allSummaries);
        setHasMore(false);
      }
      const targets = filterCookPilotSummaries(allSummaries, queryText).filter(
        (summary) => !addedIds.has(cookPilotQueueId(summary.id)),
      );
      if (targets.length === 0) return;
      const queueItems = await loadCookPilotQueueItems(user.uid, targets);
      onAddRecipes(queueItems);
    } catch (err) {
      setError(friendlyRecipeLibraryError(err, "Couldn't add those recipes."));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-cp-4">
      <div className="flex items-center justify-between gap-cp-3">
        <h3 className="field-label mb-0">
          CookPilot recipes
          {summaries.length > 0
            ? ` (${summaries.length}${!isSearching && hasMore ? "+" : ""})`
            : ""}
        </h3>
        {!loading && !error && visibleSummaries.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-compact flex-shrink-0"
            onClick={handleAddAll}
            disabled={bulkBusy}
          >
            {bulkBusy ? <SpinnerIcon size={ICON_SIZE.sm} /> : null}
            {allVisibleAdded ? "Remove all" : "Add all"}
          </button>
        )}
      </div>

      <div className="relative">
        <SearchIcon size={ICON_SIZE.lg} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          id="cookpilot-search"
          className="field !pl-11"
          placeholder="Search your recipes..."
          aria-label="Search your CookPilot recipes"
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
        />
      </div>

      {loading && (
        <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon size={ICON_SIZE.lg} />
            Loading your recipes
          </span>
        </div>
      )}

      {!loading && error && (
        <div className="state state--error" role="alert">
          <h4>Couldn&apos;t load recipes</h4>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && summaries.length === 0 && (
        <EmptyState
          title="No recipes yet"
          description={
            <>
              Import from{" "}
              <a
                href="https://cookpilotapp.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-ink underline decoration-line-strong underline-offset-2 hover:text-ink-soft"
              >
                CookPilot
                <ExternalIcon size={ICON_SIZE.sm} />
              </a>
            </>
          }
        />
      )}

      {!loading && !error && !loadingMore && summaries.length > 0 && visibleSummaries.length === 0 && (
        <EmptyState
          title="No matches"
          description="Try a different title, tag, or ingredient."
        />
      )}

      {!loading && !error && visibleSummaries.length > 0 && (
        <ul className="cookpilot-recipe-list flex flex-col gap-cp-2">
          {visibleSummaries.map((summary) => (
            <li key={summary.id}>
              <RecipeRow
                summary={summary}
                added={addedIds.has(cookPilotQueueId(summary.id))}
                adding={addingIds.has(summary.id)}
                onToggle={() => handleToggle(summary)}
              />
            </li>
          ))}
          {!isSearching && hasMore && <li ref={sentinelRef} aria-hidden className="h-px" />}
        </ul>
      )}

      {!loading && loadingMore && (
        <div className="flex items-center justify-center gap-2 py-cp-2 text-ink-soft text-cp-caption">
          <SpinnerIcon size={ICON_SIZE.sm} />
          Loading more recipes…
        </div>
      )}

      {!loading && !loadingMore && loadMoreError && (
        <div className="state state--error" role="alert">
          <h4>Couldn&apos;t load more recipes</h4>
          <p>{loadMoreError}</p>
          <button type="button" className="btn btn-secondary btn-compact mt-cp-3" onClick={retryLoadMore}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function CookPilotImportSource({
  items,
  onAddRecipes,
  onRemoveRecipe,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  const { user, ready, redirectError } = useCookPilotAuth();
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  return (
    <div className="flex flex-col gap-cp-4">
      {!ready && (
        <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon size={ICON_SIZE.lg} />
            Checking CookPilot
          </span>
        </div>
      )}

      {ready && !user && (
        <SignedOutCookPilotImport
          onEmailLogin={() => setShowEmailLogin(true)}
          redirectError={redirectError}
        />
      )}

      {ready && user && (
        <SignedInCookPilotImport
          user={user}
          items={items}
          onAddRecipes={onAddRecipes}
          onRemoveRecipe={onRemoveRecipe}
        />
      )}

      {showEmailLogin && !user && (
        <CookPilotLoginDialog onClose={() => setShowEmailLogin(false)} />
      )}
    </div>
  );
}
