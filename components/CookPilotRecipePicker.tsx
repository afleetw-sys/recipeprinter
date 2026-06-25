"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
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
import { PlateIcon, SearchIcon, SpinnerIcon, XIcon } from "@/components/icons";

const googleProvider = new GoogleAuthProvider();

function displayNameFor(user: User): string {
  return user.displayName || user.email || "CookPilot";
}

function metaFor(summary: CookPilotRecipeSummary): string {
  const bits: string[] = [];
  if (summary.totalTimeMinutes) bits.push(`${summary.totalTimeMinutes} min`);
  const servings = summary.preferredServings ?? summary.servings;
  if (servings) bits.push(`Serves ${servings}`);
  return bits.join(" · ");
}

function useCookPilotAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser && !nextUser.isAnonymous ? nextUser : null);
      setReady(true);
    });
  }, []);

  return { user, ready };
}

function LoginPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      onSignedIn();
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
      onSignedIn();
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
    <div className="panel p-cp-5 flex flex-col gap-cp-4">
      <div>
        <h3 className="font-extrabold tracking-[-0.02em] text-[1.05rem]">Log in to CookPilot</h3>
        <p className="text-[0.86rem] text-ink-soft mt-1">
          Use an existing account to choose recipes for this print list.
        </p>
      </div>

      <button type="button" className="btn btn-primary w-full" onClick={handleGoogle} disabled={busy}>
        {busy ? <SpinnerIcon size={16} /> : null}
        Continue with Google
      </button>

      {!showEmail ? (
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
  );
}

function RecipePickerDialog({
  user,
  addedIds,
  onClose,
  onAdd,
}: {
  user: User;
  addedIds: Set<string>;
  onClose: () => void;
  onAdd: (items: QueueItem[]) => number;
}) {
  const [summaries, setSummaries] = useState<CookPilotRecipeSummary[]>([]);
  const [queryText, setQueryText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
          setError(err instanceof Error ? err.message : "Couldn't load CookPilot recipes.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user.uid]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const visibleSummaries = useMemo(
    () => filterCookPilotSummaries(summaries, queryText),
    [summaries, queryText],
  );

  const selectableSelected = summaries.filter(
    (summary) => selectedIds.has(summary.id) && !addedIds.has(cookPilotQueueId(summary.id)),
  );

  function toggle(summary: CookPilotRecipeSummary) {
    const queueId = cookPilotQueueId(summary.id);
    if (addedIds.has(queueId) || adding) return;
    setNotice(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(summary.id)) {
        next.delete(summary.id);
      } else {
        next.add(summary.id);
      }
      return next;
    });
  }

  async function handleAddSelected() {
    if (selectableSelected.length === 0 || adding) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const items = await loadCookPilotQueueItems(user.uid, selectableSelected);
      const addedCount = onAdd(items);
      if (addedCount > 0) {
        onClose();
      } else {
        setNotice("Those recipes are already in the print list.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add those recipes.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-cp-4 py-cp-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookpilot-picker-title"
    >
      <div className="panel w-full max-w-[760px] max-h-[min(760px,92vh)] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between gap-cp-4 p-cp-5 border-b border-line">
          <div className="min-w-0">
            <h3 id="cookpilot-picker-title" className="font-extrabold tracking-[-0.02em] text-[1.12rem]">
              Choose from CookPilot
            </h3>
            <p className="text-[0.84rem] text-ink-soft mt-1 truncate">
              Signed in as {displayNameFor(user)}
            </p>
          </div>
          <button type="button" className="btn-ghost btn-compact" onClick={onClose} aria-label="Close">
            <XIcon size={17} />
          </button>
        </header>

        <div className="p-cp-5 border-b border-line">
          <label className="field-label" htmlFor="cookpilot-search">
            Search recipes
          </label>
          <div className="relative">
            <SearchIcon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              id="cookpilot-search"
              className="field pl-11"
              placeholder="Search by title, tag, or ingredient"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-cp-5">
          {loading && (
            <div className="h-40 grid place-items-center text-ink-soft">
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon size={18} />
                Loading CookPilot recipes
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
              <p className="font-bold text-[1.02rem]">No CookPilot recipes yet</p>
              <p className="text-ink-soft text-[0.88rem] mt-1.5">
                Saved CookPilot recipes will appear here.
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
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-cp-3">
              {visibleSummaries.map((summary) => {
                const queueId = cookPilotQueueId(summary.id);
                const alreadyAdded = addedIds.has(queueId);
                const selected = selectedIds.has(summary.id) && !alreadyAdded;
                const meta = metaFor(summary);

                return (
                  <li key={summary.id}>
                    <button
                      type="button"
                      className={`w-full text-left rounded-lg border p-cp-3 flex gap-cp-3 transition-colors ${
                        alreadyAdded
                          ? "border-line bg-page/70 text-ink-soft cursor-default"
                          : selected
                            ? "border-brand ring-2 ring-brand/20 bg-card"
                            : "border-line bg-card hover:border-line-strong"
                      }`}
                      disabled={alreadyAdded || adding}
                      aria-pressed={selected}
                      onClick={() => toggle(summary)}
                    >
                      <span className="w-16 h-16 rounded overflow-hidden bg-gradient-to-br from-brand-50 to-teal-50 flex-shrink-0 grid place-items-center text-brand/45">
                        {summary.imageURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={summary.imageURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <PlateIcon size={25} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold leading-snug line-clamp-2">{summary.title}</span>
                        {meta && <span className="block text-[0.78rem] text-ink-soft mt-1">{meta}</span>}
                        <span className="block text-[0.74rem] font-semibold mt-2 text-brand">
                          {alreadyAdded ? "Added" : selected ? "Selected" : "Add to print list"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="p-cp-5 border-t border-line flex items-center gap-cp-3">
          <p className="text-[0.82rem] text-ink-soft mr-auto">
            {notice ?? `${selectableSelected.length} selected`}
          </p>
          <button type="button" className="btn-ghost btn-compact" onClick={onClose} disabled={adding}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={handleAddSelected}
            disabled={selectableSelected.length === 0 || adding}
          >
            {adding ? <SpinnerIcon size={16} /> : null}
            {selectableSelected.length > 0
              ? `Add selected (${selectableSelected.length})`
              : "Add selected"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function CookPilotRecipePicker({
  items,
  onAddRecipes,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
}) {
  const { user, ready } = useCookPilotAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      await signOut(getFirebaseAuth());
      setShowPicker(false);
      setShowLogin(false);
    } finally {
      setAuthBusy(false);
    }
  }

  if (!ready) {
    return (
      <button type="button" className="btn btn-secondary btn-compact" disabled>
        <SpinnerIcon size={16} />
        CookPilot
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-cp-2 flex-wrap">
        {user ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setShowPicker(true)}
            >
              <PlateIcon size={16} />
              Choose from CookPilot
            </button>
            <span className="hidden sm:inline text-[0.78rem] text-ink-soft max-w-[160px] truncate">
              {displayNameFor(user)}
            </span>
            <button
              type="button"
              className="btn-ghost btn-compact"
              onClick={handleSignOut}
              disabled={authBusy}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={() => setShowLogin(true)}
          >
            Log in to CookPilot
          </button>
        )}
      </div>

      {showLogin && !user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-cp-4 py-cp-6"
          role="dialog"
          aria-modal="true"
          aria-label="Log in to CookPilot"
        >
          <div className="w-full max-w-[420px] relative">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 btn-ghost btn-compact"
              onClick={() => setShowLogin(false)}
              aria-label="Close"
            >
              <XIcon size={17} />
            </button>
            <LoginPanel
              onSignedIn={() => {
                setShowLogin(false);
                setShowPicker(true);
              }}
            />
          </div>
        </div>
      )}

      {showPicker && user && (
        <RecipePickerDialog
          user={user}
          addedIds={addedIds}
          onClose={() => setShowPicker(false)}
          onAdd={onAddRecipes}
        />
      )}
    </>
  );
}
