"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import {
  AccountIcon,
  AppleIcon,
  BookIcon,
  GaugeIcon,
  GoogleIcon,
  ICON_SIZE,
  LogoutIcon,
  SettingsIcon,
} from "@/components/icons";
import {
  CookPilotLoginDialog,
  appleProvider,
  googleProvider,
  prewarmCookPilotAuth,
  signInWithTrackedProvider,
  useCookPilotAuth,
} from "@/components/CookPilotAuth";
import { importAllowanceLine } from "@/lib/freeImports";
import { friendlyAuthError } from "@/lib/friendlyErrors";
import { useImportUsage } from "@/lib/useImportUsage";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { loadLocalProjects } from "@/lib/localProjects";
import { summarizePrintProject } from "@/lib/printProjects";
import { useProjectCount } from "@/lib/projectCount";
import { hasLocalCookbookUnlocks } from "@/lib/cookbookUnlocks";
import { navigateAfterOverlayHistory } from "@/lib/useBackDismiss";
import { libraryProjects } from "@/lib/projectLibrary";
import { useMenuDismiss } from "@/lib/useMenuDismiss";
import type { PrintProjectSummary } from "@/types/recipe";
import type { AuthProvider, User } from "firebase/auth";
import type { ReactNode } from "react";
import { IconButton } from "@/components/Controls";

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-lg px-cp-3 py-cp-2 text-left text-cp-small font-semibold text-ink hover:bg-page";

/**
 * The one row a signed-out press can't simply follow: there is nothing on
 * /projects without an account, so it asks for sign-in, saying what for, and
 * the page follows once that is done. Settings goes straight to its page,
 * which shows the plans and offers sign-in itself (Amelia, 2026-10-13).
 */
const DESTINATIONS = {
  "/projects": {
    title: "Sign in to see your projects",
    body: "Your saved recipe cards and cookbooks open on this device or another one.",
  },
} as const;
type Destination = keyof typeof DESTINATIONS;

// Two initials from the signed-in identity — first+last of a display name, else
// the first letter of the email — so a logged-in avatar shows who's signed in.
// Exported for AccountPersonalDetails, which draws the same avatar at the top
// of /account — one rule for "what does this account's avatar say" rather
// than a second copy that could drift from this one.
export function accountInitials(user: User): string {
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
 * The account avatar: one dropdown, signed in or not. Signed out it leads with
 * the ways to sign in, and its rows say what an account holds (Amelia,
 * 2026-10-13: people pressed the avatar, got a sign-in dialog they hadn't
 * asked for, and closed it).
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
  compact?: boolean | "header";
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
  /** The sign-in dialog, and the page a row was headed for when it opened. */
  const [login, setLogin] = useState<{ destination?: Destination } | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const router = useRouter();
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
   * The number on the "Projects" row: the same merged (account + on-device)
   * count `/projects` shows, kept on this device so it is there the moment the
   * menu opens rather than read from the account each time. See
   * lib/projectCount for when it is re-read.
   */
  const projectCount = useProjectCount(user?.uid, open);

  /** Pressing the avatar opens the dropdown, signed in or not. */
  const pressAvatar = useCallback(() => setOpen((value) => !value), []);

  // The provider buttons open a popup from the press itself, which a browser
  // only allows if nothing has to be fetched first.
  useEffect(() => {
    if (open && ready && !user) void prewarmCookPilotAuth();
  }, [open, ready, user]);

  /**
   * Signing in from here: the menu and dialog close, and a row that asked for
   * sign-in on the way somewhere carries on to it. Only for a sign-in this
   * button watched happen, so a returning visitor's restored session doesn't
   * shut a menu they have just opened.
   */
  const uid = user?.uid;
  const sawSignedOutRef = useRef(false);
  const destinationRef = useRef<Destination | undefined>(undefined);
  destinationRef.current = login?.destination;
  useEffect(() => {
    if (!ready) return;
    if (!uid) {
      sawSignedOutRef.current = true;
      return;
    }
    if (!sawSignedOutRef.current) return;
    sawSignedOutRef.current = false;
    const destination = destinationRef.current;
    setOpen(false);
    setLogin(null);
    setProviderBusy(false);
    setProviderError(null);
    // The dialog's teardown pops the history entry it pushed; see
    // `navigateAfterOverlayHistory` for why the navigation waits for that.
    if (destination) navigateAfterOverlayHistory(() => router.push(destination));
  }, [ready, uid, router]);

  async function signInWith(provider: AuthProvider, method: "google" | "apple") {
    setProviderBusy(true);
    setProviderError(null);
    try {
      await signInWithTrackedProvider(provider, method, () => setProviderBusy(false));
    } catch (err) {
      setProviderError(
        friendlyAuthError(
          err,
          method === "google"
            ? "We couldn't sign in with Google. Please try again."
            : "We couldn't sign in with Apple. Please try again.",
        ),
      );
      setProviderBusy(false);
    }
  }

  // The click that arrived before this chunk did. Waits for `ready` so it can
  // do exactly what the real button would have.
  useEffect(() => {
    if (!activateOnReady || !ready) return;
    // Opens, never toggles: a replayed press that ran twice would shut the
    // menu it had just opened.
    setOpen(true);
    onActivated?.();
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
    setOpen(true);
  }, [openWhenReady, ready]);

  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuDismiss(rootRef, closeMenu, { enabled: open, closeOnScroll: false });

  return (
    <div
      ref={rootRef}
      className="relative flex items-center"
      // Read by `.recipe-mobile-topbar:has([data-account-menu-open])` in
      // app/print/print.css — on mobile /print, this button sits inside that
      // bar, which normally sits at z-index 6 (tied with, and sometimes
      // losing to, the deck's own floating controls). That rule was written
      // to lift the bar above them while the panel is open, but nothing ever
      // set this attribute for it to match against, so it never fired and
      // the panel stayed paintable-over. `|| undefined` so the attribute is
      // absent (not `data-account-menu-open="false"`, which `:has([attr])`
      // would still match) whenever the panel is closed.
      data-account-menu-open={open ? "" : undefined}
    >
      {/* One control, signed in or not — see the same button in
          `AccountControl`, which draws it while this chunk is still loading.
          Signed in it holds your initials on the accent; signed out, a person
          in a hairline outline (Amelia, 2026-10-11). Same box either way, so nothing resizes when auth
          resolves and nothing has to guess what shape to hold in the meantime. */}
      <IconButton
        data-rp-avatar={compact === "header" ? "header" : compact ? "compact" : "full"}
        className={
          user
            /* --cp-on-accent, not --cp-ink. Ink on the accent is 2.66:1 —
               your initials were the least legible text in the app. The token
               exists precisely so this pairing is not re-decided by hand at
               each call site; it resolves to white here, 5.08:1. */
            ? "border border-transparent bg-[var(--cp-accent)] text-[var(--cp-on-accent)] font-bold tracking-tight"
            : "bg-transparent text-ink"
        }
        // Signed out it keeps the placeholder's name (see `AccountControl`), so
        // the control is not renamed under someone as this chunk arrives.
        aria-label={user ? "Open account menu" : "Open account or sign in"}
        title={user ? "Open account menu" : "Open account or sign in"}
        aria-expanded={open}
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

      {open && ready && (
        // `z-[var(--z-menu)]`, not a bare Tailwind `z-50` — this panel sits
        // directly in the page's normal flow (SiteHeader isn't always
        // `sticky`, e.g. on /projects and /account, so it has no elevated
        // stacking context of its own), and page content below it — a
        // project card's absolutely positioned hover controls, for one — was
        // winning the stacking order and rendering through it. The app's own
        // menu tier (above chrome, below dialogs — see the --z-* scale and
        // .cp-menu in globals.css) is unambiguously above anything a page's
        // own content ever declares.
        <div
          className={`absolute right-0 top-11 z-[var(--z-menu)] rounded-2xl border border-line bg-card p-cp-2 shadow-cp-lg ${
            user ? "w-[min(220px,calc(100vw-2rem))]" : "w-[min(264px,calc(100vw-2rem))]"
          }`}
        >
          {!user && (
            /* The real buttons, not a "Sign in" row that opens a dialog: for
               Google and Apple this is the whole of signing in, one press from
               the avatar. Email needs fields, so it opens the dialog. */
            <div className="mb-cp-1 flex flex-col gap-cp-2 border-b border-line px-cp-1 pb-cp-3 pt-cp-1">
              <p className="px-cp-2 text-cp-small font-bold text-ink">Sign in or create an account</p>
              <div className="grid grid-cols-2 gap-cp-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact w-full"
                  disabled={providerBusy}
                  onClick={() => void signInWith(googleProvider, "google")}
                >
                  <GoogleIcon size={ICON_SIZE.md} />
                  Google
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact w-full"
                  disabled={providerBusy}
                  onClick={() => void signInWith(appleProvider, "apple")}
                >
                  <AppleIcon size={ICON_SIZE.md} />
                  Apple
                </button>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-compact w-full"
                disabled={providerBusy}
                onClick={() => {
                  closeMenu();
                  setLogin({});
                }}
              >
                Continue with email
              </button>
              {providerError && <p className="field-error px-cp-2" role="alert">{providerError}</p>}
            </div>
          )}
          <MenuImportUsage />
          <Link href="/account" className={ROW_CLASS} onClick={closeMenu}>
            <SettingsIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
            Settings
          </Link>
          <ProjectsRow
            // A cookbook bought on this device without an account is already
            // paid for, so its shelf is never behind sign-in (see `listed`).
            open={!!user || listed.length > 0}
            onNavigate={closeMenu}
            onSignIn={() => {
              closeMenu();
              setLogin({ destination: "/projects" });
            }}
          >
            <BookIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
            <span className="flex-1">Projects</span>
            {user && projectCount !== null && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-line bg-page px-1 text-cp-caption font-bold leading-none text-ink-soft">
                {projectCount}
              </span>
            )}
          </ProjectsRow>
          {user && (
            <div className="mt-cp-1 border-t border-line pt-cp-1">
              <button
                type="button"
                className={ROW_CLASS}
                onClick={() => {
                  closeMenu();
                  // Settings is only a sign-in gate once you are signed out, so
                  // leaving from there goes home rather than straight to a prompt
                  // to sign back in. Anywhere else, you stay where you were.
                  if (window.location.pathname.startsWith("/account")) router.replace("/");
                  void signOut(getFirebaseAuth());
                }}
              >
                <LogoutIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}

      {login && !user && (
        <CookPilotLoginDialog
          onClose={() => setLogin(null)}
          // Not `onClose`: the row's destination is read once the account
          // arrives (the effect above), and closing first would forget it.
          onAuthenticated={() => undefined}
          intro={login.destination ? DESTINATIONS[login.destination] : undefined}
        />
      )}
    </div>
  );
}

/** The Projects row: a link when there is a shelf to open, else the way to one. */
function ProjectsRow({
  open,
  onNavigate,
  onSignIn,
  children,
}: {
  open: boolean;
  onNavigate: () => void;
  onSignIn: () => void;
  children: ReactNode;
}) {
  if (open) {
    return (
      <Link href="/projects" className={ROW_CLASS} onClick={onNavigate}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={ROW_CLASS} onClick={onSignIn}>
      {children}
    </button>
  );
}

/**
 * The free-import count in words: what the ring on the avatar is a picture of.
 * Its own component so the count is only read while the menu is open, and
 * nothing for a Pro member, who has no count.
 */
function MenuImportUsage() {
  const { hidden, usage } = useImportUsage();
  if (hidden) return null;
  const line = importAllowanceLine(usage);
  return (
    <div className="mb-cp-1 flex items-start gap-2 border-b border-line px-cp-3 pb-cp-3 pt-cp-2 text-cp-small">
      <GaugeIcon size={ICON_SIZE.md} className="mt-px shrink-0 text-ink-soft" />
      <div>
        <p className="font-semibold text-ink">{line.lead}</p>
        {line.detail && <p className="text-ink-soft">{line.detail}</p>}
      </div>
    </div>
  );
}
