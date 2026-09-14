"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { AccountIcon, ChevronRightIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { loadPrintProjectSummaries, summarizePrintProject } from "@/lib/printProjects";
import { loadLocalProjects } from "@/lib/localProjects";
import { hasLocalCookbookUnlocks } from "@/lib/cookbookUnlocks";
import { libraryProjects } from "@/lib/projectLibrary";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import type { PrintProjectSummary } from "@/types/recipe";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { IconButton } from "@/components/Controls";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { ProBadge } from "@/components/ProBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { withTimeout } from "@/lib/withTimeout";
import { track } from "@/lib/analytics";
import {
  loadRecipePrinterCustomerInfo,
  proManagementUrl,
  proSubscriptionDetails,
} from "@/lib/recipePrinterPurchases";
import { useProPurchase } from "@/lib/useProPurchase";
import { resolveEffectiveCustomerInfo, type CustomerInfoLoadStatus } from "@/lib/proAccessFallback";
import { loadRecipePrinterUserProfile, type RecipePrinterMirroredEntitlement } from "@/lib/recipePrinterFreeTemplateClaim";

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
  /**
   * The same two sections list what is saved in THIS browser, signed in or out.
   *
   * This used to bail out for a signed-in cook (`if (!open || user) return`),
   * which is how the menu and `/projects` came to disagree: a cookbook bought
   * while signed out records its unlock locally against the local project id,
   * so until the webhook lands or the book is adopted it lives ONLY on this
   * device — listed on `/projects`, and missing from the one control a cook
   * actually reaches for. Signing in made a book you had paid for disappear.
   */
  const [localProjects, setLocalProjects] = useState<PrintProjectSummary[]>([]);
  useEffect(() => {
    // Also while CLOSED, for a signed-out visitor: the avatar no longer opens
    // this panel for them, so whether this device holds a book they bought has
    // to be known before the sign-in dialog is drawn rather than after they
    // open something they will never open. `hasLocalCookbookUnlocks` keeps that
    // off everyone else's path: no unlocks, no shelf read.
    if (!open && (user || !hasLocalCookbookUnlocks())) return;
    setLocalProjects(loadLocalProjects().map(summarizePrintProject));
  }, [open, user]);

  // One answer to "what is in my library", shared with /projects — see
  // `libraryProjects` for the three rules and for what the two surfaces used to
  // disagree about.
  const listed = useMemo(
    () => libraryProjects({ accountProjects: user ? projects : [], localProjects }),
    [user, projects, localProjects],
  );
  const cookbooks = listed.filter((project) => project.kind !== "printProject");
  const printProjects = listed.filter((project) => project.kind === "printProject");
  /** Signed out with an empty shelf there is nothing to head, so the whole
      block goes rather than sitting there as two "will appear here" lines. */
  const showProjectSections = COOKBOOK_ENABLED;

  /**
   * What pressing the avatar does, in one place.
   *
   * Signed in it is your account, so it opens the account. Signed out there is
   * no account to open, so it opens the way to having one. That is what the
   * control is for in every product that has one, and it is the same answer
   * every time rather than one that depends on what happens to be on this
   * device.
   *
   * It briefly went the other way, because the shelf can hold a cookbook you
   * bought while signed out and the menu was the only thing linking to it. The
   * sign-in dialog carries that link itself now (see `deviceBooks` below), so
   * the book stays one press away without the avatar having to mean two
   * different things.
   */
  const pressAvatar = useCallback(() => {
    if (user) {
      setOpen((value) => !value);
      return;
    }
    setOpen(false);
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

  // The shared dismissal rather than a private copy of it. This one was the
  // weakest of the copies — no Escape, no resize, and bubble-phase — while
  // sitting in the header on every route.
  //
  // `closeOnScroll` off, the same call ZoomControl makes: the panel is
  // absolutely positioned inside this root, so it rides the avatar rather than
  // being left behind by a scroll. Escape here cannot collide with the sign-in
  // dialog either — opening that closes the menu first (see the Sign in button
  // below), which disables this.
  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuDismiss(rootRef, closeMenu, { enabled: open, closeOnScroll: false });

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

  /**
   * RecipePrinter Pro status for the account menu's own section.
   *
   * Prefers the live RevenueCat SDK read (only it carries `willRenew` — the
   * mirror stores just `active`/`expiresAt`/`willRenew`* — see below — which
   * on its own still can't beat a live answer, since RevenueCat is the
   * actual billing authority). Falls back to the Firestore entitlement
   * mirror `/print` also consults only when the live read itself fails, via
   * the same `resolveEffectiveCustomerInfo` used there — see
   * lib/proAccessFallback.ts — so this section can't silently read as "Free
   * plan" during a RevenueCat/network outage the way it used to.
   *
   * `loadRecipePrinterCustomerInfo` is the same "null if this browser has
   * never had a reason to exist in RevenueCat" read `usePremiumTemplatePurchase`
   * uses — a Free user who has never purchased or subscribed costs nothing
   * extra to open this menu.
   */
  const [proCustomerInfo, setProCustomerInfo] = useState<CustomerInfo | null>(null);
  const [proInfoStatus, setProInfoStatus] = useState<CustomerInfoLoadStatus>("idle");
  const [proInfoLastVerifiedAtMs, setProInfoLastVerifiedAtMs] = useState<number | null>(null);
  const [proMirroredEntitlements, setProMirroredEntitlements] =
    useState<Record<string, RecipePrinterMirroredEntitlement> | null>(null);
  const [proMirrorSyncedAtMs, setProMirrorSyncedAtMs] = useState<number | null>(null);
  const [proInfoLoading, setProInfoLoading] = useState(false);
  const [proMessage, setProMessage] = useState<string | null>(null);
  const [showProUpgradeDialog, setShowProUpgradeDialog] = useState(false);

  const refreshProCustomerInfo = useCallback(async () => {
    if (!uid) return;
    const [liveResult, mirrorResult] = await Promise.allSettled([
      loadRecipePrinterCustomerInfo(uid),
      loadRecipePrinterUserProfile(uid),
    ]);
    if (liveResult.status === "fulfilled") {
      setProCustomerInfo(liveResult.value);
      setProInfoStatus("ok");
      setProInfoLastVerifiedAtMs(Date.now());
    } else {
      console.warn("RecipePrinter: could not load live Pro status", liveResult.reason);
      setProInfoStatus("error");
    }
    if (mirrorResult.status === "fulfilled") {
      setProMirroredEntitlements(mirrorResult.value.mirroredEntitlements);
      setProMirrorSyncedAtMs(mirrorResult.value.syncedAtMs);
    } else {
      console.warn("RecipePrinter: could not load Pro status mirror", mirrorResult.reason);
    }
  }, [uid]);

  useEffect(() => {
    if (!open || !uid) return;
    setProInfoLoading(true);
    void refreshProCustomerInfo().finally(() => setProInfoLoading(false));
  }, [open, uid, refreshProCustomerInfo]);

  // `managementURL` opens RevenueCat's billing portal in a new tab, so there
  // is no in-app navigation to hook when the cook comes back from canceling
  // or changing plans. Refetch on refocus, scoped to while the menu is open,
  // so the "active until {date}" line updates without a manual reload.
  useEffect(() => {
    if (!open || !uid) return;
    function onFocus() {
      void refreshProCustomerInfo();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, uid, refreshProCustomerInfo]);

  const effectiveProInfo = useMemo(
    () =>
      resolveEffectiveCustomerInfo({
        liveCustomerInfo: proCustomerInfo,
        liveStatus: proInfoStatus,
        liveLastVerifiedAtMs: proInfoLastVerifiedAtMs,
        mirroredEntitlements: proMirroredEntitlements,
        mirrorSyncedAtMs: proMirrorSyncedAtMs,
        nowMs: Date.now(),
      }),
    [proCustomerInfo, proInfoStatus, proInfoLastVerifiedAtMs, proMirroredEntitlements, proMirrorSyncedAtMs],
  );
  const proDetails = proSubscriptionDetails(effectiveProInfo.customerInfo);
  const proManagementLink = proManagementUrl(effectiveProInfo.customerInfo);

  const { proBusy, purchaseProAndContinue } = useProPurchase({
    revenueCatUserId: uid ?? null,
    customerInfo: effectiveProInfo.customerInfo,
    setCustomerInfo: setProCustomerInfo,
    markCustomerInfoVerified: () => {
      setProInfoStatus("ok");
      setProInfoLastVerifiedAtMs(Date.now());
    },
    cookPilotUser: user ?? null,
    showToast: setProMessage,
    clearToast: () => setProMessage(null),
    // No print/export action to return to from here — the account menu is a
    // standing status surface, not something a purchase resumes into.
    onFreshPurchase: () => undefined,
  });

  function planLabel(cycle: "monthly" | "annual" | null): string {
    if (cycle === "annual") return "Annual";
    if (cycle === "monthly") return "Monthly";
    return "Pro";
  }

  function formatDate(ms: number | null): string | null {
    if (ms === null) return null;
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

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
          pressAvatar();
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
      {/* `user`, not just `open`: signed out the avatar goes to the sign-in
          dialog and this panel is never opened, so everything in here can say
          "your account" and mean it. It used to carry a second version of
          itself — a "Keep your projects" heading, its own sign-in button, and a
          library footnote about this browser — for a state it can no longer be
          in. The one frame worth guarding against is signing out with it open,
          which this covers on the way to `setOpen(false)`. */}
      {open && user && (
        <div className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-cp-4 shadow-cp-lg">
          <div className="flex items-start justify-between gap-cp-3">
            <div className="min-w-0">
              <strong className="block truncate">
                {user.displayName || "RecipePrinter account"}
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
                  {/* An empty account: one line, not two empty sections. */}
                  {cookbooks.length === 0 && printProjects.length === 0 && (
                    <p className="text-cp-small text-ink-soft">Projects you save will appear here.</p>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mt-cp-4 border-t border-line pt-cp-3">
            <div className="flex items-center justify-between gap-cp-2">
              <span className="text-cp-small font-bold text-ink">RecipePrinter Pro</span>
              {proDetails.active && <ProBadge variant="inline" />}
            </div>
            {proInfoLoading ? (
              <p className="mt-1 text-cp-small text-ink-soft">Loading…</p>
            ) : effectiveProInfo.source === "none" && effectiveProInfo.stale ? (
              // A real RevenueCat/network failure with nothing to fall back
              // on — distinct from "Free plan" on purpose, so a temporary
              // outage never reads as having lost a subscription.
              <>
                <p className="mt-1 text-cp-small text-ink-soft">Couldn&rsquo;t load your subscription status.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact mt-cp-2 w-full"
                  onClick={() => void refreshProCustomerInfo()}
                >
                  Retry
                </button>
              </>
            ) : proDetails.active ? (
              <>
                <p className="mt-1 text-cp-small text-ink-soft">{planLabel(proDetails.cycle)} plan</p>
                <p className="text-cp-small text-ink-soft">
                  {proDetails.willRenew
                    ? `Renews ${formatDate(proDetails.expiresAtMs) ?? "soon"}`
                    : `Active through ${formatDate(proDetails.expiresAtMs) ?? "your paid period"}`}
                </p>
                {effectiveProInfo.source === "mirror-fallback" && (
                  <p className="text-cp-small text-ink-soft">
                    Showing your last verified plan
                    {effectiveProInfo.lastVerifiedAtMs
                      ? ` (as of ${formatDate(effectiveProInfo.lastVerifiedAtMs) ?? "recently"})`
                      : ""}
                    .
                  </p>
                )}
                {/* Prominent on purpose — cancellation must not be hard to
                    find. This opens RevenueCat's own hosted billing portal;
                    there is no custom cancel flow to build or maintain. */}
                <button
                  type="button"
                  className="btn btn-secondary btn-compact mt-cp-2 w-full"
                  disabled={!proManagementLink}
                  title={proManagementLink ? undefined : "Manage subscription isn't ready yet. Try again in a moment."}
                  onClick={() => {
                    if (!proManagementLink) return;
                    track("manage_subscription_clicked", {});
                    window.open(proManagementLink, "_blank", "noopener,noreferrer");
                  }}
                >
                  Manage subscription
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-cp-small text-ink-soft">Free plan</p>
                <button
                  type="button"
                  className="btn btn-primary btn-compact mt-cp-2 w-full"
                  onClick={() => {
                    track("paywall_viewed", { trigger: "account_menu" });
                    setShowProUpgradeDialog(true);
                  }}
                >
                  Upgrade to Pro
                </button>
              </>
            )}
            {proMessage && <p className="mt-1 text-cp-small text-ink-soft">{proMessage}</p>}
          </div>
          <button
              type="button"
              className="btn-ghost btn-compact mt-cp-3 w-full"
              onClick={() => void signOut(getFirebaseAuth()).then(() => setOpen(false))}
            >
              Sign out
            </button>
        </div>
      )}

      {showProUpgradeDialog && (
        <ProUpgradeDialog
          busy={proBusy}
          cookPilotUser={user}
          onClose={() => setShowProUpgradeDialog(false)}
          onChoose={(cycle) => void purchaseProAndContinue(cycle, () => setShowProUpgradeDialog(false))}
        />
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
