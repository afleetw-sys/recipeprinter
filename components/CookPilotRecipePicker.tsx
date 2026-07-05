"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getFns } from "@/lib/firebase/functions";
import { friendlyAuthError, friendlyRecipeLibraryError } from "@/lib/friendlyErrors";
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
  XIcon,
} from "@/components/icons";

const googleProvider = new GoogleAuthProvider();

function useCookPilotAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      // Parser imports use anonymous auth for CookPilot callables. That should
      // not count as being logged in to a CookPilot recipe library.
      if (nextUser?.isAnonymous) {
        setUser(null);
        setReady(true);
        return;
      }
      setUser(nextUser ?? null);
      setReady(true);
    });
  }, []);

  return { user, ready };
}

/** Which sign-in providers an email is already registered with, from CookPilot's own
 * `checkUserProviders` callable (Firebase Auth's provider list isn't usable here since
 * the project has email-enumeration protection on). Mirrors the iOS app's
 * `AuthFlowLogic.stepAfterEmailSubmit`. */
async function checkEmailProviders(email: string): Promise<string[]> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) {
    // checkUserProviders just requires *some* signed-in uid; an anonymous
    // session is enough, same as CookPilot's ensureAnonymousUserIfNeeded.
    // Scoped to this login flow only, not the shared parser call path.
    await signInAnonymously(auth);
  }
  const checkUserProviders = httpsCallable<{ email: string }, { providers: string[] | null }>(
    getFns(),
    "checkUserProviders",
  );
  const { data } = await checkUserProviders({ email });
  return data.providers ?? [];
}

function LoginDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleEmailContinue(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email for your CookPilot account.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const providers = await checkEmailProviders(normalizedEmail);

      if (
        providers.includes(GoogleAuthProvider.PROVIDER_ID) &&
        !providers.includes(EmailAuthProvider.PROVIDER_ID)
      ) {
        // This account only has Google sign-in set up, so a password will
        // never work for it. Send them straight into the Google flow, the
        // same redirect the iOS app does for this case.
        await signInWithPopup(getFirebaseAuth(), googleProvider);
        onClose();
        return;
      }

      if (
        providers.includes("apple.com") &&
        !providers.includes(GoogleAuthProvider.PROVIDER_ID) &&
        !providers.includes(EmailAuthProvider.PROVIDER_ID)
      ) {
        setNotice(
          "This account uses Sign in with Apple, which isn't available on the web yet. Import your recipes from the CookPilot app instead.",
        );
        return;
      }

      setStep("password");
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't verify that email. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!password) {
      setError("Enter the password for your CookPilot account.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim().toLowerCase(), password);
      onClose();
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/30 p-0 sm:px-cp-4 sm:py-cp-6"
      role="dialog"
      aria-modal="true"
      aria-label="Log in to CookPilot"
    >
      <div className="panel panel--modal w-full sm:max-w-[420px] h-full sm:h-auto rounded-none border-0 sm:rounded-2xl sm:border p-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto">
        <button
          type="button"
          className="absolute right-3 top-3 icon-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={ICON_SIZE.md} />
        </button>

        <div className="pr-cp-7">
          <h3 className="font-extrabold tracking-[-0.02em] text-cp-h2">
            Log in to CookPilot
          </h3>
          <p className="text-cp-small text-ink-soft mt-1">
            Use an existing account to choose recipes for this print list.
          </p>
        </div>

        {step === "email" ? (
          <form className="flex flex-col gap-cp-3" onSubmit={handleEmailContinue}>
            <div>
              <label className="field-label" htmlFor="cookpilot-email">
                Email
              </label>
              <input
                id="cookpilot-email"
                className="field"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Continue
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-cp-3" onSubmit={handlePasswordSubmit}>
            <div>
              <label className="field-label" htmlFor="cookpilot-password">
                Password for {email.trim()}
              </label>
              <input
                id="cookpilot-password"
                className="field"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Sign in
            </button>
            <button
              type="button"
              className="btn-ghost btn-compact w-full"
              onClick={() => {
                setStep("email");
                setPassword("");
                setError(null);
              }}
              disabled={busy}
            >
              Use a different email
            </button>
          </form>
        )}

        {notice && (
          <div className="state" role="status">
            <p>{notice}</p>
          </div>
        )}

        {error && (
          <div className="state state--error" role="alert">
            <h4>Couldn't sign in</h4>
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SignedOutCookPilotImport({
  onEmailLogin,
}: {
  onEmailLogin: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
    } finally {
      setBusy(false);
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
      <div className="flex flex-col sm:flex-row justify-center gap-cp-3 mt-cp-5">
        <button type="button" className="btn btn-primary" onClick={handleGoogle} disabled={busy}>
          {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
          Continue with Google
        </button>
        <button type="button" className="btn btn-secondary" onClick={onEmailLogin} disabled={busy}>
          Continue with Email
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
  const time = summary.totalTimeMinutes ? `${summary.totalTimeMinutes} min` : null;
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
        <span className="inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-brand-ink">
          <CheckIcon size={ICON_SIZE.md} />
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
            {allVisibleAdded ? "Deselect all" : "Add all"}
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
        <LoginDialog onClose={() => setShowEmailLogin(false)} />
      )}
    </div>
  );
}
