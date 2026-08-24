"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { AccountIcon, BookIcon, ICON_SIZE, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { loadPrintProjects } from "@/lib/printProjects";
import { groupDuplicateProjects } from "@/lib/duplicateProjects";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import type { PrintProject } from "@/types/recipe";
import type { User } from "firebase/auth";
import { IconButton } from "@/components/Controls";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";

// Two initials from the signed-in identity — first+last of a display name, else
// the first letter of the email — so a logged-in avatar shows who's signed in.
function accountInitials(user: User): string {
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0].slice(0, 2);
    if (letters) return letters.toUpperCase();
  }
  const email = user.email?.trim();
  if (email) return email[0].toUpperCase();
  return "";
}

// The saved-projects list was re-read from Firestore on every dropdown open —
// open/close/open fired a fresh read each time. Cache the last successful load
// per uid: reopening within the fresh window skips the read entirely, and a
// stale reopen shows the cached list instantly (no spinner flash) while it
// refetches in the background. A project just saved elsewhere can lag by at most
// the fresh window before it shows on reopen — fine for a convenience list.
const projectsCache = new Map<string, { projects: PrintProject[]; at: number }>();
const PROJECTS_FRESH_MS = 10_000;

/**
 * The account avatar, its dropdown, and the sign-in dialog.
 *
 * Split out of AccountControl and loaded on demand, because this is the only
 * thing on a marketing page that needs Firebase. Everything here reaches
 * `firebase/auth` (86 KB) through `useCookPilotAuth`, and SiteHeader renders on
 * every route — so a statically prerendered FAQ page was shipping an auth SDK
 * to draw a circle. See components/AccountControl for what decides when this
 * arrives.
 */
export default function AccountMenu({
  activateOnReady,
  onActivated,
}: {
  /** A click landed on the placeholder avatar before this chunk arrived. Act on
      it as soon as auth resolves — the dropdown if they're signed in, the sign-in
      dialog if not, which is exactly what the real button would have done. */
  activateOnReady?: boolean;
  onActivated?: () => void;
}) {
  const { user, ready } = useCookPilotAuth();
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [projects, setProjects] = useState<PrintProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Stale forks left by an old autosave bug are hidden here as well as on
  // /projects — a cook should never catch sight of the mess, whichever surface
  // they open. The deletion itself belongs to the Projects page, which knows
  // which copies are purchased; this menu only filters what it shows.
  const visible = useMemo(
    () => groupDuplicateProjects(projects).map((group) => group.keeper),
    [projects],
  );
  const cookbooks = visible.filter((project) => project.kind !== "printProject");
  const printProjects = visible.filter((project) => project.kind === "printProject");

  // The click that arrived before this chunk did. Waits for `ready` so it can
  // route to the same place the real button would have: the dropdown when
  // signed in, the sign-in dialog when not.
  useEffect(() => {
    if (!activateOnReady || !ready) return;
    if (user) setOpen(true);
    else setShowLogin(true);
    onActivated?.();
  }, [activateOnReady, ready, user, onActivated]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!open || !user || !COOKBOOK_ENABLED) return;
    const uid = user.uid;
    const cached = projectsCache.get(uid);
    if (cached) {
      // Show the last-known list immediately — no empty flash — and skip the
      // read outright while it's still fresh.
      setProjects(cached.projects);
      if (Date.now() - cached.at < PROJECTS_FRESH_MS) return;
    }
    let cancelled = false;
    setLoadingProjects(!cached);
    loadPrintProjects(uid)
      .then((next) => {
        projectsCache.set(uid, { projects: next, at: Date.now() });
        if (!cancelled) setProjects(next);
      })
      .catch(() => {
        // Keep whatever was cached on a transient failure rather than blanking.
        if (!cancelled && !cached) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <IconButton
        data-rp-avatar
        className={`${
          user
            ? "border border-transparent bg-[var(--cp-accent)] text-[var(--cp-ink)] font-bold tracking-tight"
            : "border border-line bg-card text-ink-soft hover:text-ink hover:border-ink-soft"
        }`}
        aria-label={user ? "Recipe Printer account" : "Sign in to Recipe Printer"}
        title={user ? "Recipe Printer account" : "Sign in to Recipe Printer"}
        onClick={() => {
          if (!ready) return;
          if (user) setOpen((value) => !value);
          else setShowLogin(true);
        }}
      >
        {user && accountInitials(user) ? (
          <span aria-hidden>{accountInitials(user)}</span>
        ) : (
          <AccountIcon size={ICON_SIZE.md} />
        )}
      </IconButton>

      {open && user && (
        <div className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-cp-4 shadow-cp-lg">
          <div className="flex items-start justify-between gap-cp-3">
            <div className="min-w-0">
              <strong className="block truncate">
                {user.displayName || "Recipe Printer account"}
              </strong>
              <span className="block truncate text-cp-small text-ink-soft">
                {user.email || "Signed in"}
              </span>
            </div>
            <IconButton onClick={() => setOpen(false)} aria-label="Close account menu">
              <XIcon size={ICON_SIZE.sm} />
            </IconButton>
          </div>
          {/* Hidden until the cookbook feature launches — gated by the same
              COOKBOOK_ENABLED flag as the print-page toggle so relaunch is a
              one-line flip. (Also lists saved recipe cards, so restoring
              it brings back the saved-projects list too.) */}
          {COOKBOOK_ENABLED && (
            <div className="mt-cp-4 border-t border-line pt-cp-3">
              <strong className="flex items-center gap-2 text-cp-small">
                <BookIcon size={ICON_SIZE.md} /> My cookbooks
              </strong>
              {loadingProjects ? (
                <p className="mt-2 text-cp-small text-ink-soft">Loading…</p>
              ) : cookbooks.length ? (
                <div className="mt-2 flex max-h-56 flex-col overflow-y-auto">
                  {cookbooks.map((project) => (
                    <Link
                      key={project.id}
                      href={`/print?project=${encodeURIComponent(project.id)}`}
                      className="rounded-lg px-2 py-2 hover:bg-page"
                      aria-busy={openingProjectId === project.id}
                      onClick={() => {
                        setOpeningProjectId(project.id);
                        setOpen(false);
                      }}
                    >
                      <span className="block truncate text-cp-small font-semibold">
                        {openingProjectId === project.id ? (
                          <span className="inline-flex items-center gap-2"><SpinnerIcon size={ICON_SIZE.sm} /> Opening cookbook…</span>
                        ) : project.title || "Untitled cookbook"}
                      </span>
                      <span className="text-cp-caption text-ink-soft">Cookbook</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-cp-small text-ink-soft">Your saved cookbooks will appear here.</p>
              )}
              <strong className="mt-cp-4 flex items-center gap-2 border-t border-line pt-cp-3 text-cp-small">
                <PrintIcon size={ICON_SIZE.md} /> My recipe cards
              </strong>
              {loadingProjects ? (
                <p className="mt-2 text-cp-small text-ink-soft">Loading…</p>
              ) : printProjects.length ? (
                <div className="mt-2 flex max-h-56 flex-col overflow-y-auto">
                  {printProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/print?project=${encodeURIComponent(project.id)}`}
                      className="rounded-lg px-2 py-2 hover:bg-page"
                      aria-busy={openingProjectId === project.id}
                      onClick={() => {
                        setOpeningProjectId(project.id);
                        setOpen(false);
                      }}
                    >
                      <span className="block truncate text-cp-small font-semibold">
                        {openingProjectId === project.id ? (
                          <span className="inline-flex items-center gap-2"><SpinnerIcon size={ICON_SIZE.sm} /> Opening project…</span>
                        ) : project.title || "Untitled recipe cards"}
                      </span>
                      <span className="text-cp-caption text-ink-soft">Recipe cards</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-cp-small text-ink-soft">Recipe cards you saved before will appear here.</p>
              )}
              <Link
                href="/projects"
                className="btn btn-secondary btn-compact mt-cp-3 w-full"
                onClick={() => setOpen(false)}
              >
                View all projects
              </Link>
            </div>
          )}
          <button
            type="button"
            className="btn-ghost btn-compact mt-cp-3 w-full"
            onClick={() => void signOut(getFirebaseAuth()).then(() => setOpen(false))}
          >
            Sign out
          </button>
        </div>
      )}

      {showLogin && !user && (
        <CookPilotLoginDialog onClose={() => setShowLogin(false)} onAuthenticated={() => setShowLogin(false)} />
      )}
      {openingProjectId && (
        <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col bg-page">
          <RecipeLoadingState
            className="flex-1"
            label={projects.find((project) => project.id === openingProjectId)?.kind === "printProject"
              ? "Loading your recipe cards…"
              : "Loading your cookbook…"}
          />
        </div>
      )}
    </div>
  );
}
