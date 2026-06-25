"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
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
import { CookPilotLogoIcon, SearchIcon, SpinnerIcon, XIcon } from "@/components/icons";

const googleProvider = new GoogleAuthProvider();

type LoginMode = "google" | "email";

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

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={handleGoogle}
          disabled={busy}
        >
          {busy && !showEmail ? <SpinnerIcon size={16} /> : null}
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
        Choose recipes from CookPilot
      </h3>
      <p className="text-[0.88rem] text-ink-soft mt-1 max-w-sm mx-auto">
        Sign in to browse your saved CookPilot recipes and add selected ones to this print list.
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const visibleSummaries = useMemo(
    () => filterCookPilotSummaries(summaries, queryText),
    [summaries, queryText],
  );
  const selectableVisible = visibleSummaries.filter(
    (summary) => !addedIds.has(cookPilotQueueId(summary.id)),
  );
  const selectedSummaries = summaries.filter(
    (summary) => selectedIds.has(summary.id) && !addedIds.has(cookPilotQueueId(summary.id)),
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
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (item.method === "cookpilot") next.delete(item.id.replace(/^cookpilot:/, ""));
      }
      return next;
    });
  }, [items]);

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

  function selectAllVisible() {
    setNotice(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const summary of selectableVisible) {
        next.add(summary.id);
      }
      return next;
    });
  }

  async function handleAddSelected() {
    if (selectedSummaries.length === 0 || adding) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const queueItems = await loadCookPilotQueueItems(user.uid, selectedSummaries);
      const addedCount = onAddRecipes(queueItems);
      setSelectedIds(new Set());
      setNotice(
        addedCount > 0
          ? `Added ${addedCount} ${addedCount === 1 ? "recipe" : "recipes"} to the print list.`
          : "Those recipes are already in the print list.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add those recipes.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-cp-4">
      <div>
        <label className="field-label" htmlFor="cookpilot-search">
          Search CookPilot
        </label>
        <div className="relative">
          <SearchIcon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            id="cookpilot-search"
            className="field pl-11"
            placeholder="Search by title, tag, or ingredient"
            value={queryText}
            onChange={(event) => {
              setQueryText(event.target.value);
              setNotice(null);
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-cp-3 flex-wrap">
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          onClick={selectAllVisible}
          disabled={selectableVisible.length === 0 || adding}
        >
          Select All
        </button>
        <button
          type="button"
          className="btn-ghost btn-compact"
          onClick={() => {
            setSelectedIds(new Set());
            setNotice(null);
          }}
          disabled={selectedSummaries.length === 0 || adding}
        >
          Clear selection
        </button>
        <p className="text-[0.82rem] text-ink-soft ml-auto">
          {selectedSummaries.length} selected
        </p>
      </div>

      {loading && (
        <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
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
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-cp-3 max-h-[420px] overflow-y-auto pr-1">
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
                        ? "border-brand bg-card"
                        : "border-line bg-card hover:border-line-strong"
                  }`}
                  disabled={alreadyAdded || adding}
                  aria-pressed={selected}
                  onClick={() => toggle(summary)}
                >
                  <span className="w-16 h-16 rounded overflow-hidden bg-page flex-shrink-0 grid place-items-center text-brand/60">
                    {summary.imageURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={summary.imageURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <CookPilotLogoIcon size={25} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug line-clamp-2">{summary.title}</span>
                    {meta && <span className="block text-[0.78rem] text-ink-soft mt-1">{meta}</span>}
                    <span className="block text-[0.74rem] font-semibold mt-2 text-brand">
                      {alreadyAdded ? "Added" : selected ? "Selected" : "Select"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <div className="state">
          <h4>CookPilot</h4>
          <p>{notice}</p>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={handleAddSelected}
        disabled={selectedSummaries.length === 0 || adding}
      >
        {adding ? <SpinnerIcon size={18} /> : <span className="text-lg leading-none">+</span>}
        {selectedSummaries.length > 0
          ? `Add Selected to Print List (${selectedSummaries.length})`
          : "Add Selected to Print List"}
      </button>
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
