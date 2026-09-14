"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { AccountIcon, BookIcon, ICON_SIZE, LogoutIcon, SettingsIcon } from "@/components/icons";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { loadLocalProjects } from "@/lib/localProjects";
import { loadPrintProjectSummaries, summarizePrintProject } from "@/lib/printProjects";
import { hasLocalCookbookUnlocks } from "@/lib/cookbookUnlocks";
import { libraryProjects } from "@/lib/projectLibrary";
import { useMenuDismiss } from "@/lib/useMenuDismiss";
import type { PrintProjectSummary } from "@/types/recipe";
import type { User } from "firebase/auth";
import { IconButton } from "@/components/Controls";

// Reopening the dropdown moments after closing it re-ran the same Firestore
// read for a number that had not changed. Same fresh-window idea as the old
// preview dropdown's own `projectsCache` — a badge is worth a cheap number,
// not a fresh one on every open.
const projectCountCache = new Map<string, { count: number; at: number }>();
const PROJECT_COUNT_FRESH_MS = 10_000;

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

/**
 * The account avatar: a two-item dropdown signed in, the sign-in dialog
 * signed out.
 *
 * Split out of AccountControl and loaded on demand, because this is the only
 * thing on a marketing page that needs Firebase. Everything here reaches
 * `firebase/auth` (86 KB) through `useCookPilotAuth`, and SiteHeader renders on
 * every route — so a statically prerendered FAQ page was shipping an auth SDK
 * to draw a circle. See components/AccountControl for what decides when this
 * arrives.
 *
 * Used to also BE the two destinations — a projects list, RecipePrinter Pro
 * status, sign out, all inline in the panel. Now the panel just points at
 * `/account` (settings: personal details, plan/billing, sign out) and
 * `/projects` (cookbooks and recipe cards) — two different questions
 * ("who am I" vs. "what have I made") that don't belong on one screen, so the
 * dropdown's job shrank to naming the fork rather than answering both branches
 * itself.
 */
export default function AccountAvatarButton({
  compact = false,
  activateOnReady,
  onActivated,
  onMounted,
}: {
  /** Sizes the avatar to the bar it is in — handed down from `SiteHeader`
      through `AccountControl`, which renders the very same button while this
      chunk is still loading. They have to agree, or the handover is a visible
      resize. */
  compact?: boolean;
  /** A click landed on the placeholder avatar before this chunk arrived. Opens
      the dropdown (or the sign-in dialog) the moment auth resolves, exactly
      what the real button would have done. */
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
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * Books saved on THIS device, signed out — the escape hatch for someone who
   * bought a cookbook without an account and isn't going to make one now. Only
   * read when there's a reason to: `hasLocalCookbookUnlocks` keeps this off
   * everyone else's path.
   */
  const [localProjects, setLocalProjects] = useState<PrintProjectSummary[]>([]);
  useEffect(() => {
    if (user || !hasLocalCookbookUnlocks()) return;
    setLocalProjects(loadLocalProjects().map(summarizePrintProject));
  }, [user]);
  const listed = useMemo(
    () => libraryProjects({ accountProjects: [], localProjects }),
    [localProjects],
  );

  /**
   * The number on the "Projects" row — the same merged (account + on-device)
   * count `/projects` itself shows, out of the same `libraryProjects` rule.
   * Read only on open, and cached briefly, exactly the trade-off the old
   * preview dropdown made for its own project list: a badge doesn't need to
   * be more current than the last few seconds, and every open of a header
   * control is not worth a fresh Firestore read.
   */
  const uid = user?.uid;
  const [projectCount, setProjectCount] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !uid) return;
    const cached = projectCountCache.get(uid);
    if (cached && Date.now() - cached.at < PROJECT_COUNT_FRESH_MS) {
      setProjectCount(cached.count);
      return;
    }
    let cancelled = false;
    Promise.all([loadPrintProjectSummaries(uid), Promise.resolve(loadLocalProjects().map(summarizePrintProject))])
      .then(([accountProjects, freshLocalProjects]) => {
        if (cancelled) return;
        const count = libraryProjects({ accountProjects, localProjects: freshLocalProjects }).length;
        projectCountCache.set(uid, { count, at: Date.now() });
        setProjectCount(count);
      })
      .catch(() => {
        // No badge is a truer answer than a wrong one — leave whatever was
        // last known (possibly null) rather than showing a count that failed.
      });
    return () => {
      cancelled = true;
    };
  }, [open, uid]);

  /**
   * What pressing the avatar does, in one place.
   *
   * Signed in it opens the dropdown — Settings or Projects, your call. Signed
   * out there is no account to open, so it opens the way to having one; the
   * sign-in dialog carries a link to any cookbook bought on this device (see
   * `listed` above) rather than making a signed-out visitor navigate away
   * from wherever they were to reach it.
   */
  const pressAvatar = useCallback(() => {
    if (user) {
      setOpen((value) => !value);
      return;
    }
    setShowLogin(true);
  }, [user]);

  // The click that arrived before this chunk did. Waits for `ready` so it can
  // route to the same place the real button would have.
  useEffect(() => {
    if (!activateOnReady || !ready) return;
    pressAvatar();
    onActivated?.();
    // `pressAvatar` is not a dependency: it changes identity the moment auth
    // resolves, and re-running this on that would replay the same press twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateOnReady, ready, onActivated]);

  /* The avatar used to drop any press that arrived before auth resolved, which
     is a real window on a prerendered page: the SEO landing pages ship no
     Firebase at all, so the first press often lands while the auth chunk is
     still in flight and the control did nothing whatsoever. Remember it and
     open on `ready` instead — the same treatment `activateOnReady` already
     gives a press that beat this chunk to the page. */
  useEffect(() => {
    if (!openWhenReady || !ready) return;
    setOpenWhenReady(false);
    pressAvatar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWhenReady, ready]);

  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuDismiss(rootRef, closeMenu, { enabled: open, closeOnScroll: false });

  return (
    <div ref={rootRef} className="relative flex items-center">
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
          if (!ready) {
            setOpenWhenReady(true);
            return;
          }
          setOpenWhenReady(false);
          pressAvatar();
        }}
      >
        {user && accountInitials(user) ? (
          <span aria-hidden>{accountInitials(user)}</span>
        ) : (
          <AccountIcon size={ICON_SIZE.md} />
        )}
      </IconButton>

      {open && user && (
        <div className="absolute right-0 top-11 z-50 w-[min(220px,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-cp-2 shadow-cp-lg">
          <Link
            href="/account"
            className="flex items-center gap-2 rounded-lg px-cp-3 py-cp-2 text-cp-small font-semibold text-ink hover:bg-page"
            onClick={closeMenu}
          >
            <SettingsIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
            Settings
          </Link>
          <Link
            href="/projects"
            className="flex items-center gap-2 rounded-lg px-cp-3 py-cp-2 text-cp-small font-semibold text-ink hover:bg-page"
            onClick={closeMenu}
          >
            <BookIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
            {/* A plain count, not a pill — the same "· N" the project cards
                already use for recipe counts, so this doesn't introduce a
                second way the app marks a number next to a label. */}
            <span className="flex-1">
              Projects
              {projectCount !== null && (
                <span className="text-ink-soft"> · {projectCount}</span>
              )}
            </span>
          </Link>
          <div className="mt-cp-1 border-t border-line pt-cp-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-cp-3 py-cp-2 text-left text-cp-small font-semibold text-ink hover:bg-page"
              onClick={() => {
                closeMenu();
                void signOut(getFirebaseAuth());
              }}
            >
              <LogoutIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
              Sign out
            </button>
          </div>
        </div>
      )}

      {showLogin && !user && (
        <CookPilotLoginDialog
          onClose={() => setShowLogin(false)}
          onAuthenticated={() => setShowLogin(false)}
          /**
           * The way on for someone who bought a cookbook without an account and
           * is not going to make one now.
           *
           * Signing in is genuinely the better answer, because the unlock is
           * recorded against a project id on this device and only an account
           * carries it to another one. But a book that has been paid for cannot
           * sit behind a form: this is the door that used to be the account
           * menu, moved to the one screen a signed-out press now lands on.
           */
          footer={
            listed.length > 0 ? (
              <p className="text-cp-small text-ink-soft leading-relaxed">
                A cookbook you bought is saved in this browser.{" "}
                <Link
                  href="/projects"
                  className="underline underline-offset-2"
                  onClick={() => setShowLogin(false)}
                >
                  Open it
                </Link>{" "}
                without signing in.
              </p>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
