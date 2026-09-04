"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { AccountIcon, ChevronRightIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { loadPrintProjectSummaries, summarizePrintProject } from "@/lib/printProjects";
import { listableLocalProjects, loadLocalProjects } from "@/lib/localProjects";

/** This branch only runs signed OUT, where there is no account list to dedupe
    the device shelf against. */
const EMPTY_ACCOUNT: ReadonlySet<string> = new Set();
import { isCookbookProjectUnlocked } from "@/lib/cookbookUnlocks";
import { groupDuplicateProjects } from "@/lib/duplicateProjects";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import type { PrintProjectSummary } from "@/types/recipe";
import type { User } from "firebase/auth";
import { IconButton } from "@/components/Controls";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { withTimeout } from "@/lib/withTimeout";

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
const projectsCache = new Map<string, { projects: PrintProjectSummary[]; at: number }>();
const PROJECTS_FRESH_MS = 10_000;

/**
 * How long to wait for the saved-projects read before calling it dead.
 *
 * Both reads inside `loadPrintProjectSummaries` are `.catch`-guarded, so a Firestore
 * that *fails* is handled. The case this exists for is a Firestore that never
 * answers at all: `getDocs` has no timeout of its own, so a blocked or dropped
 * connection leaves the promise pending forever — and "Loading…" sat under both
 * headings for as long as the menu stayed open, with nothing to click and
 * nothing said. Long enough not to trip on a slow phone; short enough that
 * nobody watches it and concludes their cookbooks are gone.
 */
const PROJECTS_TIMEOUT_MS = 12_000;

/**
 * How long the full-page "Opening…" cover waits for a navigation that may
 * never come. It is torn down by this component unmounting when the new route
 * renders, so a navigation that stalls — a chunk that 404s after a deploy, a
 * dead connection — used to leave a full-screen spinner with no way out but a
 * reload. Generous, because the destination is the heaviest page in the app.
 */
const OPENING_TIMEOUT_MS = 15_000;

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
  compact = false,
  activateOnReady,
  onActivated,
  onMounted,
}: {
  /** Sizes the avatar and the sign-in button to the bar they are in — handed
      down from `SiteHeader` through `AccountControl`, which renders the very
      same two controls while this chunk is still loading. They have to agree,
      or the handover is a visible resize. */
  compact?: boolean;
  /** A click landed on the placeholder avatar before this chunk arrived. Open
      the dropdown as soon as auth resolves, which is exactly what the real
      button would have done. */
  activateOnReady?: boolean;
  onActivated?: () => void;
  /** Fired once, from a layout effect, so `AccountControl` can drop its
      placeholder avatar in the same commit this one appears in. */
  onMounted?: () => void;
}) {
  const { user, ready } = useCookPilotAuth();
  // Layout, not passive: the placeholder this replaces must go before a paint,
  // or both avatars are briefly in the row.
  const mountedRef = useRef(onMounted);
  mountedRef.current = onMounted;
  useLayoutEffect(() => {
    mountedRef.current?.();
  }, []);
  const [open, setOpen] = useState(false);
  /** A press that landed before auth resolved, opened once it has. */
  const [openWhenReady, setOpenWhenReady] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [projects, setProjects] = useState<PrintProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  /** The read didn't answer. Distinct from "no projects" — see the render. */
  const [projectsFailed, setProjectsFailed] = useState(false);
  /** Bumped by Retry to re-run the load effect. */
  const [reloadProjects, setReloadProjects] = useState(0);
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
  /**
   * Signed out, the same two sections list what is saved in THIS browser.
   * `/projects` has always shown these; the menu simply never asked for them,
   * so the one place a visitor looks for their work had nothing in it while
   * the page one click further on was full.
   */
  const [localProjects, setLocalProjects] = useState<PrintProjectSummary[]>([]);
  useEffect(() => {
    if (!open || user) return;
    setLocalProjects(loadLocalProjects().map(summarizePrintProject));
  }, [open, user]);

  /* Same rule the /projects page follows: the device shelf is a safety net,
     not a list of your saved work, so the only local-only thing that surfaces
     is a cookbook that has been PAID FOR — hiding that would hide what the
     money bought. Everything else a signed-out visitor has is a draft, and the
     menu no longer offers it as though it were filed. */
  const listed = user
    ? visible
    : listableLocalProjects(localProjects, EMPTY_ACCOUNT, isCookbookProjectUnlocked);
  const cookbooks = listed.filter((project) => project.kind !== "printProject");
  const printProjects = listed.filter((project) => project.kind === "printProject");
  /** Signed out with an empty shelf there is nothing to head, so the whole
      block goes rather than sitting there as two "will appear here" lines. */
  const showProjectSections = COOKBOOK_ENABLED && (user ? true : listed.length > 0);

  // The click that arrived before this chunk did. Waits for `ready` so it can
  // route to the same place the real button would have: the dropdown when
  // signed in, the sign-in dialog when not.
  useEffect(() => {
    if (!activateOnReady || !ready) return;
    // The menu either way. Signed out this used to jump to the sign-in dialog,
    // which is the behaviour the button itself no longer has — a replayed click
    // has to land where a live one would.
    setOpen(true);
    onActivated?.();
  }, [activateOnReady, ready, user, onActivated]);

  /* The avatar used to drop any press that arrived before auth resolved, which
     is a real window on a prerendered page: the SEO landing pages ship no
     Firebase at all, so the first press often lands while the auth chunk is
     still in flight and the control did nothing whatsoever. Remember it and
     open on `ready` instead — the same treatment `activateOnReady` already
     gives a press that beat this chunk to the page. */
  useEffect(() => {
    if (!openWhenReady || !ready) return;
    setOpenWhenReady(false);
    setOpen(true);
  }, [openWhenReady, ready]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  // Keyed on the uid, not the `user` object, which Firebase replaces on every
  // token refresh — the same fix the other account-keyed effects already got.
  const uid = user?.uid;
  useEffect(() => {
    if (!open || !uid || !COOKBOOK_ENABLED) return;
    const cached = projectsCache.get(uid);
    if (cached) {
      // Show the last-known list immediately — no empty flash — and skip the
      // read outright while it's still fresh.
      setProjects(cached.projects);
      if (Date.now() - cached.at < PROJECTS_FRESH_MS) return;
    }
    let cancelled = false;
    setLoadingProjects(!cached);
    setProjectsFailed(false);
    // `getDocs` never settles against a Firestore it cannot reach, so the
    // deadline is the only thing that can end this — see lib/withTimeout.
    withTimeout(loadPrintProjectSummaries(uid), PROJECTS_TIMEOUT_MS)
      .then((next) => {
        projectsCache.set(uid, { projects: next, at: Date.now() });
        if (!cancelled) setProjects(next);
      })
      .catch(() => {
        // Keep whatever was cached on a transient failure rather than blanking.
        // With nothing cached there is nothing honest to show, so say so and
        // offer the read again rather than claiming an empty library.
        if (cancelled) return;
        if (!cached) {
          setProjects([]);
          setProjectsFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, uid, reloadProjects]);

  /**
   * The cover over a navigation that never arrived.
   *
   * `openingProjectId` is cleared by this component unmounting as the new route
   * renders — which is the whole design, and fine right up until the navigation
   * stalls. Then a `fixed inset-0` spinner owns the entire viewport and the only
   * way out is a reload. So: a deadline, and Escape, both of which put the page
   * back exactly as it was. Clicking the project again is a fair second try.
   */
  useEffect(() => {
    if (!openingProjectId) return;
    const timer = window.setTimeout(() => setOpeningProjectId(null), OPENING_TIMEOUT_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpeningProjectId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openingProjectId]);

  /* The read behind both lists is a single call, so both say the same thing
     when it doesn't answer: what happened, and the way to ask again. Never an
     empty state — "Your saved cookbooks will appear here" under a failed read
     tells someone their library is empty when we simply don't know. */
  const projectsUnavailable = (
    <div className="mt-2">
      <p className="text-cp-small text-ink-soft">We couldn’t load your projects.</p>
      <button
        type="button"
        className="btn btn-secondary btn-compact mt-2"
        onClick={() => setReloadProjects((count) => count + 1)}
      >
        Try again
      </button>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative flex items-center"
      /* The panel is `z-50` inside whatever bar hosts this control, so it can
         only ever stack as high as that bar does. On a phone the bar is
         `.recipe-mobile-topbar` at z-index 6 — the same value as the deck's
         floating page controls — and equal values fall back to DOM order,
         which the deck wins. Marking the root lets the bar lift itself for as
         long as the menu is open (see app/print/print.css) rather than sitting
         permanently above sheets it should stay under. */
      data-account-menu-open={open ? "" : undefined}
    >
      {/* One control, signed in or not — see the same button in
          `AccountControl`, which draws it while this chunk is still loading.
          Signed in it holds your initials on the accent; signed out, a person
          on the neutral fill. Same box either way, so nothing resizes when auth
          resolves and nothing has to guess what shape to hold in the meantime. */}
      <IconButton
        data-rp-avatar={compact ? "compact" : "full"}
        className={
          user
            /* --cp-on-accent, not --cp-ink. Ink on the accent is 2.66:1 —
               your initials were the least legible text in the app. The token
               exists precisely so this pairing is not re-decided by hand at
               each call site; it resolves to white here, 5.08:1. */
            ? "border border-transparent bg-[var(--cp-accent)] text-[var(--cp-on-accent)] font-bold tracking-tight"
            : "icon-button--filled"
        }
        aria-label="RecipePrinter account"
        title="RecipePrinter account"
        aria-busy={openWhenReady || undefined}
        onClick={() => {
          // Signed out, this used to go straight to the sign-in dialog, so the
          // avatar was a door with exactly one thing behind it. A visitor with
          // projects saved on this device had no way to reach them: /projects
          // lists them without an account, but nothing in the app linked there.
          if (!ready) {
            setOpenWhenReady(true);
            return;
          }
          setOpenWhenReady(false);
          setOpen((value) => !value);
        }}
      >
        {user && accountInitials(user) ? (
          <span aria-hidden>{accountInitials(user)}</span>
        ) : (
          <AccountIcon size={ICON_SIZE.md} />
        )}
      </IconButton>

      {/* One dropdown, both states. It is the same panel doing the same job —
          here is your work, here is the account it belongs to — so signed out
          it wears the same box and the same two project sections rather than a
          smaller card of its own. */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-cp-4 shadow-cp-lg">
          <div className="flex items-start justify-between gap-cp-3">
            <div className="min-w-0">
              <strong className="block truncate">
                {user ? user.displayName || "RecipePrinter account" : "Keep your projects"}
              </strong>
              <span className="block truncate text-cp-small text-ink-soft">
                {user
                  ? user.email || "Signed in"
                  : listed.length > 0
                    ? "Saved in this browser for now."
                    : "An account keeps them on every device."}
              </span>
            </div>
            <IconButton onClick={() => setOpen(false)} aria-label="Close account menu">
              <XIcon size={ICON_SIZE.sm} />
            </IconButton>
          </div>
          {!user && (
            <button
              type="button"
              className="btn btn-primary mt-cp-4 w-full"
              onClick={() => {
                setOpen(false);
                setShowLogin(true);
              }}
            >
              Sign in or create an account
            </button>
          )}
          {/* Hidden until the cookbook feature launches — gated by the same
              COOKBOOK_ENABLED flag as the print-page toggle so relaunch is a
              one-line flip. (Also lists saved recipe cards, so restoring
              it brings back the saved-projects list too.) */}
          {showProjectSections && (
            <div className="mt-cp-4 border-t border-line pt-cp-3">
              {loadingProjects ? (
                <p className="text-cp-small text-ink-soft">Loading…</p>
              ) : projectsFailed ? (
                projectsUnavailable
              ) : (
                <>
                  {/* A heading over nothing is not information. An empty
                      section used to sit here saying it was empty, which in a
                      dropdown this small is most of the panel spent on the
                      absence of something. */}
                  {cookbooks.length > 0 && (
                    <>
                      <Link
                        href="/projects"
                        /* `text-ink`, because the global `a { color: var(--cp-blue) }`
                           makes every anchor cornflower — right for a link inside a
                           sentence, wrong for a row in a menu, where it turned the
                           whole panel blue. The accent comes back on hover. */
                        className="flex items-center justify-between gap-2 text-cp-small font-bold text-ink hover:text-brand-ink"
                        onClick={() => setOpen(false)}
                      >
                        Cookbooks
                        <ChevronRightIcon size={ICON_SIZE.sm} />
                      </Link>
                      <div className="mt-2 flex max-h-56 flex-col overflow-y-auto">
                        {cookbooks.map((project) => (
                          <Link
                            key={project.id}
                            href={`/print?project=${encodeURIComponent(project.id)}`}
                            className="rounded-lg px-2 py-2 text-ink hover:bg-page"
                            aria-busy={openingProjectId === project.id}
                            onClick={() => {
                              setOpeningProjectId(project.id);
                              setOpen(false);
                            }}
                          >
                            {/* No "Cookbook" line under the title. It sat under
                                every row of a section already headed Cookbooks,
                                so it said nothing the heading hadn't, twice per
                                row, in a panel this size. */}
                            <span className="block truncate text-cp-small font-semibold">
                              {openingProjectId === project.id ? (
                                <span className="inline-flex items-center gap-2"><SpinnerIcon size={ICON_SIZE.sm} /> Opening cookbook…</span>
                              ) : project.title || "Untitled cookbook"}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                  {printProjects.length > 0 && (
                    <>
                      <Link
                        href="/projects"
                        className={`flex items-center justify-between gap-2 text-cp-small font-bold text-ink hover:text-brand-ink ${
                          cookbooks.length > 0 ? "mt-cp-4 border-t border-line pt-cp-3" : ""
                        }`}
                        onClick={() => setOpen(false)}
                      >
                        Recipe cards
                        <ChevronRightIcon size={ICON_SIZE.sm} />
                      </Link>
                      <div className="mt-2 flex max-h-56 flex-col overflow-y-auto">
                        {printProjects.map((project) => (
                          <Link
                            key={project.id}
                            href={`/print?project=${encodeURIComponent(project.id)}`}
                            className="rounded-lg px-2 py-2 text-ink hover:bg-page"
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
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                  {/* Signed in with an empty account: one line, not two empty
                      sections. Signed out this branch is unreachable, because
                      the whole block is hidden with nothing on the shelf. */}
                  {cookbooks.length === 0 && printProjects.length === 0 && (
                    <p className="text-cp-small text-ink-soft">Projects you save will appear here.</p>
                  )}
                </>
              )}
              {/* Signed out, every project in this list lives in one browser's
                  storage and nothing else. Said once at the foot of the list,
                  where it reads as a fact about the list rather than a warning
                  attached to each item. */}
              {!user && listed.length > 0 && (
                <p className="mt-cp-3 border-t border-line pt-cp-3 text-cp-caption text-ink-soft leading-relaxed">
                  Kept in this browser only.
                </p>
              )}
            </div>
          )}
          {user && (
            <button
              type="button"
              className="btn-ghost btn-compact mt-cp-3 w-full"
              onClick={() => void signOut(getFirebaseAuth()).then(() => setOpen(false))}
            >
              Sign out
            </button>
          )}
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
