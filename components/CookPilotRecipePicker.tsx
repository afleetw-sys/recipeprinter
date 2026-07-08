"use client";

import { useEffect, useMemo, useState } from "react";
import { signInWithPopup, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { friendlyAuthError, friendlyRecipeLibraryError } from "@/lib/friendlyErrors";
import { formatRecipeTime } from "@/lib/time";
import {
  appleProvider,
  CookPilotLoginDialog,
  googleProvider,
  useCookPilotAuth,
} from "@/components/CookPilotAuth";
import {
  cookPilotQueueId,
  filterCookPilotSummaries,
  getCachedCookPilotSummaries,
  loadCookPilotQueueItems,
  loadCookPilotRecipeSummaries,
  type CookPilotRecipeSummary,
} from "@/lib/cookpilotRecipes";
import type { QueueItem } from "@/types/recipe";
import {
  CheckIcon,
  ClockIcon,
  CookPilotLogoIcon,
  ExternalIcon,
  ICON_SIZE,
  SearchIcon,
  SpinnerIcon,
  UsersIcon,
} from "@/components/icons";

function SignedOutCookPilotImport({
  onEmailLogin,
}: {
  onEmailLogin: () => void;
}) {
  const [busyProvider, setBusyProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = busyProvider !== null;

  async function handleGoogle() {
    setBusyProvider("google");
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleApple() {
    setBusyProvider("apple");
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), appleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Apple. Please try again."));
    } finally {
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
      {error && (
        <div className="state state--error mt-cp-4 text-left" role="alert">
          <h4>Couldn't sign in</h4>
          <p>{error}</p>
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
          ? "border-brand bg-brand-50/60"
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
          {adding ? <SpinnerIcon size={ICON_SIZE.md} /> : <span className="text-base leading-none">+</span>}
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
  const [error, setError] = useState<string | null>(null);

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
    let alive = true;
    setLoading(true);
    setError(null);
    loadCookPilotRecipeSummaries(user.uid)
      .then((nextSummaries) => {
        if (alive) setSummaries(nextSummaries);
      })
      .catch((err) => {
        if (alive) {
          setError(friendlyRecipeLibraryError(err, "Couldn't load your recipes."));
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user.uid]);

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
    if (visibleNotAdded.length === 0) return;
    setError(null);
    setBulkBusy(true);
    try {
      const queueItems = await loadCookPilotQueueItems(user.uid, visibleNotAdded);
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
          CookPilot recipes{summaries.length > 0 ? ` (${summaries.length})` : ""}
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
          <h4>Couldn't load recipes</h4>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && summaries.length === 0 && (
        <div className="text-center py-cp-7 px-cp-5 rounded-2xl border border-dashed border-line-strong">
          <p className="font-bold text-cp-h2">No recipes yet</p>
          <p className="text-ink-soft text-cp-small mt-1.5">
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
          </p>
        </div>
      )}

      {!loading && !error && summaries.length > 0 && visibleSummaries.length === 0 && (
        <div className="text-center py-cp-7 px-cp-5 rounded-2xl border border-dashed border-line-strong">
          <p className="font-bold text-cp-h2">No matches</p>
          <p className="text-ink-soft text-cp-small mt-1.5">
            Try a different title, tag, or ingredient.
          </p>
        </div>
      )}

      {!loading && !error && visibleSummaries.length > 0 && (
        <ul className="cookpilot-recipe-list flex flex-col gap-cp-2 max-h-[520px] overflow-y-auto pr-1">
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
        </ul>
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
  const { user, ready } = useCookPilotAuth();
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
        <SignedOutCookPilotImport onEmailLogin={() => setShowEmailLogin(true)} />
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
