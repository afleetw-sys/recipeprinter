"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/Controls";
import { AccountIcon, CheckIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";

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

const STATUS_LABEL: Record<AccountSaveStatus, string> = {
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — changes pending",
  error: "Couldn’t save",
  conflict: "Newer version found",
  adoption: "Finish saving to your account",
};

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
      {saveStatus && (
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-1 text-cp-caption text-ink-soft bg-transparent border-0"
          onClick={
            saveStatus === "error" || saveStatus === "adoption" || saveStatus === "conflict"
              ? onRetry
              : undefined
          }
          aria-live="polite"
        >
          {saveStatus === "saving" ? (
            <SpinnerIcon size={ICON_SIZE.sm} />
          ) : saveStatus === "saved" ? (
            <CheckIcon size={ICON_SIZE.sm} />
          ) : null}
          {STATUS_LABEL[saveStatus]}
        </button>
      )}

      {showMenu ? (
        <AccountMenu
          activateOnReady={pendingClick}
          onActivated={() => setPendingClick(false)}
        />
      ) : (
        /* Same size and shape as the real avatar, so nothing shifts when the
           menu takes over. Signed-out styling on purpose: this only renders
           for a browser with no record of an account, or in the moment before
           the chunk lands for one that has. */
        <IconButton
          data-rp-avatar
          className="border border-line bg-card text-ink-soft hover:text-ink hover:border-ink-soft"
          aria-label="Sign in to Recipe Printer"
          title="Sign in to Recipe Printer"
          onClick={() => {
            setPendingClick(true);
            setShowMenu(true);
          }}
        >
          <AccountIcon size={ICON_SIZE.lg} />
        </IconButton>
      )}
    </div>
  );
}
