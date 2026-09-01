"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { friendlyAuthError, friendlyRecipeLibraryError } from "@/lib/friendlyErrors";
import { formatRecipeTime } from "@/lib/time";
import {
  appleProvider,
  CookPilotLoginDialog,
  googleProvider,
  prewarmCookPilotAuth,
  signInWithCookPilotProvider,
  useCookPilotAuth,
} from "@/components/CookPilotAuth";
import {
  cookPilotImportSummary,
  cookPilotQueueId,
  getCachedCookPilotSummaries,
  hasMoreCookPilotSummaries,
  loadAllCookPilotRecipeSummaries,
  loadCookPilotQueueItems,
  loadCookPilotRecipeSummaries,
  loadMoreCookPilotRecipeSummaries,
  type CookPilotRecipeSummary,
} from "@/lib/cookpilotRecipes";
import { filterImportSummaries, type ImportSummary } from "@/lib/importSummary";
import type { QueueItem } from "@/types/recipe";
import { EmptyState } from "@/components/EmptyState";
import { RecipeSourceList } from "@/components/import/RecipeSourceList";
import {
  CookPilotLogoIcon,
  ExternalIcon,
  ICON_SIZE,
  SpinnerIcon,
} from "@/components/icons";

export async function prewarmCookPilotImport(): Promise<void> {
  await Promise.all([
    prewarmCookPilotAuth(),
    import("@/lib/firebase/functions").then(() => undefined),
  ]);
}

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
        <p className="field-error mt-cp-4 text-left" role="alert">{error ?? redirectError}</p>
      )}
    </div>
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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
  // The shared list speaks `ImportSummary`; the loaders below speak CookPilot's
  // own shape and need it back to fetch a recipe's detail, so the two are kept
  // side by side rather than one being converted away.
  const rows = useMemo(() => summaries.map(cookPilotImportSummary), [summaries]);
  const byId = useMemo(
    () => new Map(summaries.map((summary) => [summary.id, summary] as const)),
    [summaries],
  );
  const visibleRows = useMemo(() => filterImportSummaries(rows, queryText), [rows, queryText]);
  const allVisibleAdded =
    visibleRows.length > 0 && visibleRows.every((row) => addedIds.has(row.queueId));

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
          setError(friendlyRecipeLibraryError(err, "We couldn't load your recipes. Please try again."));
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
        if (aliveRef.current) {
          setError(friendlyRecipeLibraryError(err, "We couldn't load more recipes. Please try again."));
        }
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
          if (aliveRef.current) {
            setLoadMoreError(friendlyRecipeLibraryError(err, "We couldn't load more recipes. Please try again."));
          }
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
        setLoadMoreError(
          friendlyRecipeLibraryError(err, "We couldn't load more recipes. Please try again."),
        );
      })
      .finally(() => setLoadingMore(false));
  }

  async function handleToggle(row: ImportSummary) {
    const summary = byId.get(row.id);
    if (!summary) return;
    if (addingIds.has(summary.id)) return;
    if (addedIds.has(row.queueId)) {
      onRemoveRecipe(row.queueId);
      return;
    }
    setError(null);
    setAddingIds((current) => new Set(current).add(summary.id));
    try {
      const queueItems = await loadCookPilotQueueItems(user.uid, [summary]);
      onAddRecipes(queueItems);
    } catch (err) {
      setError(friendlyRecipeLibraryError(err, "We couldn't add that recipe. Please try again."));
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
      visibleRows.forEach((row) => onRemoveRecipe(row.queueId));
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
      const targets = filterImportSummaries(allSummaries.map(cookPilotImportSummary), queryText)
        .filter((row) => !addedIds.has(row.queueId))
        .map((row) => allSummaries.find((summary) => summary.id === row.id))
        .filter((summary): summary is CookPilotRecipeSummary => Boolean(summary));
      if (targets.length === 0) return;
      const queueItems = await loadCookPilotQueueItems(user.uid, targets);
      onAddRecipes(queueItems);
    } catch (err) {
      setError(friendlyRecipeLibraryError(err, "We couldn't add those recipes. Please try again."));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <RecipeSourceList
      heading="CookPilot recipes"
      countLabel={
        summaries.length > 0
          ? `(${summaries.length}${!isSearching && hasMore ? "+" : ""})`
          : undefined
      }
      summaries={visibleRows}
      addedIds={addedIds}
      addingIds={addingIds}
      bulkBusy={bulkBusy}
      allVisibleAdded={allVisibleAdded}
      onToggle={handleToggle}
      onAddAll={handleAddAll}
      queryText={queryText}
      onQueryChange={setQueryText}
      searchId="cookpilot-search"
      searchLabel="Search your CookPilot recipes"
      loading={loading}
      error={error}
      // A search that has emptied the list while the rest of the library is
      // still arriving isn't "no matches" yet.
      showNoMatches={!loadingMore}
      fallbackIcon={CookPilotLogoIcon}
      emptyState={
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
      }
      footer={
        <>
          {/* Sits below the list rather than inside it now that the list is
              shared — the observer only cares that it scrolls into view. */}
          {!isSearching && hasMore && !loading && <div ref={sentinelRef} aria-hidden className="h-px" />}

          {!loading && loadingMore && (
            <div className="flex items-center justify-center gap-2 py-cp-2 text-ink-soft text-cp-caption">
              <SpinnerIcon size={ICON_SIZE.sm} />
              Loading more recipes…
            </div>
          )}

          {!loading && !loadingMore && loadMoreError && (
            <div>
              <p className="field-error" role="alert">{loadMoreError}</p>
              <button
                type="button"
                className="btn btn-secondary btn-compact mt-cp-3"
                onClick={retryLoadMore}
              >
                Try again
              </button>
            </div>
          )}
        </>
      }
    />
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
