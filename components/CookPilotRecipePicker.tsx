"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  cookPilotQueueId,
  filterCookPilotSummaries,
  loadCookPilotQueueItems,
  loadCookPilotRecipeSummaries,
  type CookPilotRecipeSummary,
} from "@/lib/cookpilotRecipes";
import type { QueueItem } from "@/types/recipe";
import {
  CheckIcon,
  ClockIcon,
  CookPilotLogoIcon,
  SearchIcon,
  SpinnerIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";

const googleProvider = new GoogleAuthProvider();

type LoginMode = "google" | "email";

function useCookPilotAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      // RecipePrinter has no use for anonymous accounts. Earlier builds created
      // them before each parser call; those sessions can still be restored from
      // IndexedDB and keep refreshing tokens (showing up as active anon users in
      // Firebase). Purge any we encounter instead of just hiding them.
      if (nextUser?.isAnonymous) {
        deleteUser(nextUser).catch(() => signOut(getFirebaseAuth()).catch(() => {}));
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

function LoginDialog({
  initialMode,
  onClose,
}: {
  initialMode: LoginMode;
  onClose: () => void;
}) {
  const [showEmail, setShowEmail] = useState(initialMode === "email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in with Google.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Enter the email and password for your CookPilot account.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), normalizedEmail, password);
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code.includes("invalid-credential") || code.includes("wrong-password")) {
        setError("That email or password didn't match a CookPilot account.");
      } else {
        setError(err instanceof Error ? err.message : "Couldn't sign in.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-cp-4 py-cp-6"
      role="dialog"
      aria-modal="true"
      aria-label="Log in to CookPilot"
    >
      <div className="panel w-full max-w-[420px] p-cp-5 flex flex-col gap-cp-4 relative">
        <button
          type="button"
          className="absolute right-3 top-3 btn-ghost btn-compact"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={17} />
        </button>

        <div className="pr-cp-7">
          <h3 className="font-extrabold tracking-[-0.02em] text-[1.05rem]">
            Log in to CookPilot
          </h3>
          <p className="text-[0.86rem] text-ink-soft mt-1">
            Use an existing account to choose recipes for this print list.
          </p>
        </div>

        {initialMode === "google" && (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={handleGoogle}
            disabled={busy}
          >
            {busy && !showEmail ? <SpinnerIcon size={16} /> : null}
            Continue with Google
          </button>
        )}

        {initialMode === "google" && !showEmail ? (
          <button
            type="button"
            className="btn-ghost btn-compact w-full"
            onClick={() => {
              setShowEmail(true);
              setError(null);
            }}
            disabled={busy}
          >
            Use email instead
          </button>
        ) : (
          <form className="flex flex-col gap-cp-3" onSubmit={handleEmailSubmit}>
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
            <div>
              <label className="field-label" htmlFor="cookpilot-password">
                Password
              </label>
              <input
                id="cookpilot-password"
                className="field"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={16} /> : null}
              Sign in
            </button>
          </form>
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
  onLogin,
}: {
  onLogin: (mode: LoginMode) => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-cp-6 text-center bg-card">
      <div className="mx-auto w-12 h-12 rounded-xl bg-page grid place-items-center text-ink">
        <CookPilotLogoIcon size={24} />
      </div>
      <h3 className="font-extrabold tracking-[-0.02em] text-[1.05rem] mt-cp-4">
        Import from CookPilot
      </h3>
      <p className="text-[0.88rem] text-ink-soft mt-1 max-w-sm mx-auto">
        Sign in to add your saved CookPilot recipes straight to this print list.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-cp-3 mt-cp-5">
        <button type="button" className="btn btn-primary" onClick={() => onLogin("google")}>
          Continue with Google
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onLogin("email")}>
          Continue with Email
        </button>
      </div>
    </div>
  );
}

function RecipeCard({
  summary,
  added,
  adding,
  onAdd,
}: {
  summary: CookPilotRecipeSummary;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const time = summary.totalTimeMinutes ? `${summary.totalTimeMinutes} min` : null;
  const servings = summary.preferredServings ?? summary.servings;

  return (
    <div
      className={`flex items-center gap-cp-4 rounded-xl border p-cp-3 transition-shadow ${
        added ? "border-line bg-page/60" : "border-line bg-card hover:shadow-sm"
      }`}
    >
      <span className="w-[72px] h-[72px] rounded-lg overflow-hidden bg-page flex-shrink-0 grid place-items-center text-brand/60">
        {summary.imageURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={summary.imageURL} alt="" className="w-full h-full object-cover" />
        ) : (
          <CookPilotLogoIcon size={28} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug line-clamp-2">{summary.title}</p>
        {(time || servings) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-cp-3 gap-y-1 text-[0.78rem] text-ink-soft">
            {time && (
              <span className="inline-flex items-center gap-1">
                <ClockIcon size={13} />
                {time}
              </span>
            )}
            {servings && (
              <span className="inline-flex items-center gap-1">
                <UsersIcon size={13} />
                Serves {servings}
              </span>
            )}
          </p>
        )}
      </div>

      {added ? (
        <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[0.78rem] font-semibold text-emerald-700">
          <CheckIcon size={14} />
          Added
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-compact flex-shrink-0"
          onClick={onAdd}
          disabled={adding}
        >
          {adding ? <SpinnerIcon size={15} /> : <span className="text-base leading-none">+</span>}
          Add
        </button>
      )}
    </div>
  );
}

function SignedInCookPilotImport({
  user,
  items,
  onAddRecipes,
}: {
  user: User;
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
}) {
  const [summaries, setSummaries] = useState<CookPilotRecipeSummary[]>([]);
  const [queryText, setQueryText] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const visibleSummaries = useMemo(
    () => filterCookPilotSummaries(summaries, queryText),
    [summaries, queryText],
  );
  const addedCount = useMemo(
    () => summaries.filter((summary) => addedIds.has(cookPilotQueueId(summary.id))).length,
    [summaries, addedIds],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadCookPilotRecipeSummaries(user.uid)
      .then((nextSummaries) => {
        if (alive) setSummaries(nextSummaries);
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Couldn't load your recipes.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user.uid]);

  async function handleAdd(summary: CookPilotRecipeSummary) {
    const queueId = cookPilotQueueId(summary.id);
    if (addedIds.has(queueId) || addingIds.has(summary.id)) return;
    setError(null);
    setAddingIds((current) => new Set(current).add(summary.id));
    try {
      const queueItems = await loadCookPilotQueueItems(user.uid, [summary]);
      onAddRecipes(queueItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that recipe.");
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(summary.id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-cp-4">
      <div>
        <h3 className="font-extrabold tracking-[-0.02em] text-[1.05rem]">Import from CookPilot</h3>
        <p className="text-[0.86rem] text-ink-soft mt-1">
          Add any recipe to drop it straight into your print list.
        </p>
      </div>

      <div className="relative">
        <SearchIcon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          id="cookpilot-search"
          className="field pl-11"
          placeholder="Search your recipes..."
          aria-label="Search your CookPilot recipes"
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
        />
      </div>

      {loading && (
        <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon size={18} />
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
          <p className="font-bold text-[1.02rem]">No recipes yet</p>
          <p className="text-ink-soft text-[0.88rem] mt-1.5">
            Recipes you save in CookPilot will show up here to import.
          </p>
        </div>
      )}

      {!loading && !error && summaries.length > 0 && visibleSummaries.length === 0 && (
        <div className="text-center py-cp-7 px-cp-5 rounded-2xl border border-dashed border-line-strong">
          <p className="font-bold text-[1.02rem]">No matches</p>
          <p className="text-ink-soft text-[0.88rem] mt-1.5">
            Try a different title, tag, or ingredient.
          </p>
        </div>
      )}

      {!loading && !error && visibleSummaries.length > 0 && (
        <>
          <div className="flex items-center justify-between text-[0.82rem] text-ink-soft">
            <span>
              {visibleSummaries.length} {visibleSummaries.length === 1 ? "recipe" : "recipes"}
            </span>
            {addedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckIcon size={14} />
                {addedCount} in your print list
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-cp-4 max-h-[460px] overflow-y-auto pr-1">
            {visibleSummaries.map((summary) => (
              <li key={summary.id}>
                <RecipeCard
                  summary={summary}
                  added={addedIds.has(cookPilotQueueId(summary.id))}
                  adding={addingIds.has(summary.id)}
                  onAdd={() => handleAdd(summary)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function CookPilotImportSource({
  items,
  onAddRecipes,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
}) {
  const { user, ready } = useCookPilotAuth();
  const [loginMode, setLoginMode] = useState<LoginMode | null>(null);

  return (
    <div className="flex flex-col gap-cp-4">
      {!ready && (
        <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon size={18} />
            Checking CookPilot
          </span>
        </div>
      )}

      {ready && !user && <SignedOutCookPilotImport onLogin={setLoginMode} />}

      {ready && user && (
        <SignedInCookPilotImport user={user} items={items} onAddRecipes={onAddRecipes} />
      )}

      {loginMode && !user && (
        <LoginDialog initialMode={loginMode} onClose={() => setLoginMode(null)} />
      )}
    </div>
  );
}
