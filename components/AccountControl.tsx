"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/Controls";
import { AccountIcon, CheckIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { SignInButton } from "@/components/SignInButton";

/**
 * The header's right-hand side: save state, and the way in to your account.
 *
 * Nothing in this file touches Firebase, and that is the point. `SiteHeader`
 * renders on every route, so whatever it can reach statically is shipped to
 * every route — including the homepage, the FAQ, and all sixteen SEO landing
 * pages, which are prerendered content and carry the organic search traffic.
 * Reaching `AccountMenu` from here loaded `firebase/auth` (86 KB) plus the
 * functions and app SDKs on all of them, to draw a circle with a person in it.
 *
 * So the menu is fetched on demand, and the decision about WHEN uses the one
 * fact available without Firebase: has this browser ever been signed in?
 *
 *  - Yes → fetch it when the browser goes idle, so the avatar is live and
 *    correct by the time anyone looks at it. They have an account; they are
 *    going to need this.
 *  - No → don't fetch it at all until the avatar is actually clicked. A visitor
 *    who has never signed in has no account state to show, and the click is
 *    remembered and replayed (`activateOnReady`), so the sign-in dialog still
 *    opens from one press.
 *
 * The save status stays here rather than moving with the menu: it is driven
 * entirely by props from the print page and has no account dependency at all.
 */

const AccountMenu = dynamic(() => import("@/components/AccountMenu"), {
  ssr: false,
  // The placeholder is rendered by this component instead (see below), so the
  // avatar never disappears and the header never changes width while loading.
  loading: () => null,
});

export type AccountSaveStatus =
  | "saving"
  | "saved"
  | "offline"
  | "error"
  | "conflict"
  | "adoption";

/**
 * Statuses that mean something actually went wrong.
 *
 * The workspace surfaces the save state only for these. Leaving now files the
 * project on the way out, so "Saving…" and "Saved" narrate work nobody asked
 * about — but a failure is the one case where silence costs someone their book,
 * so it still has to be said. Kept beside the labels so the two lists cannot
 * drift into disagreeing about what counts as failure — and it is the same
 * question `SaveStatus` asks below to decide what earns a Retry, deliberately
 * one list rather than two that could answer differently.
 */
export const SAVE_FAILURES = new Set<AccountSaveStatus>([
  "offline",
  "error",
  "conflict",
  "adoption",
]);

export const SAVE_STATUS_LABEL: Record<AccountSaveStatus, string> = {
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — changes pending",
  error: "Couldn’t save",
  conflict: "Newer version found",
  adoption: "Finish saving to your account",
};

/**
 * What is happening to this document, said where the account is.
 *
 * Two things were wrong with it.
 *
 * It carried `hidden sm:inline-flex`, so below the small breakpoint it did not
 * render at all — a cookbook autosaving on a phone that failed to save said
 * nothing and offered no way to retry. The owner found out when the book was
 * not in their library.
 *
 * And every state looked identical: "Couldn't save" was the same grey caption
 * as "Saved", with no error colour and nothing to suggest an action. A failure
 * on a paid document read exactly like success.
 *
 * It was also always a `<button>`, including for "Saving…" and "Saved", which
 * put a focusable control in the tab order that does nothing when activated.
 * Now it is a button only when there is something to retry.
 */
function SaveStatus({
  status,
  onRetry,
}: {
  status: AccountSaveStatus;
  onRetry?: () => void;
}) {
  const failed = SAVE_FAILURES.has(status);
  const icon =
    status === "saving" ? (
      <SpinnerIcon size={ICON_SIZE.sm} />
    ) : status === "saved" ? (
      <CheckIcon size={ICON_SIZE.sm} />
    ) : null;

  if (!failed || !onRetry) {
    return (
      <span className="rp-save-status" role="status" aria-live="polite">
        {icon}
        {SAVE_STATUS_LABEL[status]}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="rp-save-status rp-save-status--failed"
      onClick={onRetry}
      aria-live="polite"
    >
      {SAVE_STATUS_LABEL[status]}
      <span className="rp-save-status__retry">Retry</span>
    </button>
  );
}

export function AccountControl({
  saveStatus,
  onRetry,
  onSave,
}: {
  saveStatus?: AccountSaveStatus | null;
  onRetry?: () => void;
  /** Save the current project. Given only by surfaces that have something
      savable AND aren't autosaving it — this is the whole save control, sat
      where the "Saved" word already appears rather than as a full-width button
      in a settings panel two columns away. */
  onSave?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  /** A click that landed before the menu chunk did, replayed once it mounts. */
  const [pendingClick, setPendingClick] = useState(false);
  /**
   * Has this browser ever been signed in? Read after mount, never during
   * render: it comes from storage, and answering it on the server (where the
   * answer is always "no") would make the first client render disagree with
   * the HTML. So the very first paint shows the sign-in button, and a returning
   * account corrects to the avatar a tick later — which is the right way round,
   * since the button is also the honest answer for anyone who never signs in.
   */
  const [wasSignedIn, setWasSignedIn] = useState(false);

  useEffect(() => {
    setWasSignedIn(readCookPilotWasSignedIn());
  }, []);

  useEffect(() => {
    if (showMenu) return;
    // Only for a browser that has an account behind it. Everyone else waits
    // for a real click, which is what keeps auth off the content pages.
    if (!readCookPilotWasSignedIn()) return;
    if (typeof window === "undefined") return;
    // Safari has no requestIdleCallback; a short timer is close enough for
    // something whose only job is "not during first paint".
    if (typeof window.requestIdleCallback !== "function") {
      const timer = window.setTimeout(() => setShowMenu(true), 400);
      return () => window.clearTimeout(timer);
    }
    const idle = window.requestIdleCallback(() => setShowMenu(true), { timeout: 2_000 });
    return () => window.cancelIdleCallback(idle);
  }, [showMenu]);

  return (
    <div className="relative flex items-center gap-cp-2">
      {/* The save control and the save STATE are the same thing in the same
          place: "Save" until it's saved, then "Saved". Not hidden on small
          screens the way the bare status text is — it's the only way to save
          a project there. */}
      {!saveStatus && onSave && (
        <button type="button" className="btn btn-secondary btn-compact" onClick={onSave}>
          Save
        </button>
      )}
      {saveStatus && <SaveStatus status={saveStatus} onRetry={onRetry} />}

      {showMenu ? (
        <AccountMenu
          activateOnReady={pendingClick}
          onActivated={() => setPendingClick(false)}
        />
      ) : wasSignedIn ? (
        /* This browser HAS an account, so an avatar is what's coming. Same size
           and shape as the real one, so nothing shifts when the menu takes
           over — and, importantly, not a "Sign in" button, which would be both
           wrong and a visible flicker on the way to the avatar. */
        <IconButton
          data-rp-avatar
          className="border border-line bg-card text-ink-soft hover:text-ink hover:border-ink-soft"
          aria-label="Recipe Printer account"
          title="Recipe Printer account"
          onClick={() => {
            setPendingClick(true);
            setShowMenu(true);
          }}
        >
          <AccountIcon size={ICON_SIZE.md} />
        </IconButton>
      ) : (
        /* No record of an account on this browser, so this is almost certainly
           where they'll stay — and it's the same button `AccountMenu` renders
           once it arrives, so the swap is invisible. The click is remembered
           and replayed (`activateOnReady`), so the dialog still opens from one
           press even though the chunk isn't here yet. */
        <SignInButton
          onClick={() => {
            setPendingClick(true);
            setShowMenu(true);
          }}
        />
      )}
    </div>
  );
}
