"use client";

import { useEffect, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { CloudCheckIcon, CloudDownloadIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";
import { savedAgo } from "@/lib/savedAgo";

export type SaveCloudState = "unsaved" | "saving" | "saved";

/**
 * Whether this project is in Projects, as one icon, the same on desktop and
 * phone (Amelia, 2026-11-22). It replaced a "Save" text button, a "✓ Saved"
 * caption and a "⋯" menu that said different things on the two layouts.
 *
 * - Not saved: a cloud with an arrow into it. Pressing it is the explicit
 *   save: signed out it opens sign-in and the save carries on after, signed in
 *   it writes the project, and from then on autosave owns it.
 * - Saving: the spinner in the same spot, so nothing moves.
 * - Saved: a cloud with a check. Pressing it says so ("Changes saved") and
 *   when it last was, so a cook can see autosave is actually doing it.
 *
 * A FAILED save is not drawn here. The page shows that as words with a retry
 * in this spot instead (`renderSaveControl`), because a failure is the one
 * save state someone has to read without pressing anything.
 */
export function SaveCloudButton({
  state,
  savedAt,
  onSave,
  disabled = false,
  signedIn,
  size,
}: {
  state: SaveCloudState;
  /** When the account copy was last written, if known. */
  savedAt: number | null;
  /** Starts the first save (or sign-in, signed out). */
  onSave: () => void;
  /** Nothing to save yet: an empty deck, signed in. */
  disabled?: boolean;
  signedIn: boolean;
  /** The bar it sits in: `SiteHeader`'s 32px controls or the phone's 30px. */
  size: "header" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const className = `icon-button rp-history-button rp-history-button--${size} rp-save-cloud`;

  // "2 minutes ago" keeps counting while it's on screen.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [open]);

  // A popover about being saved has nothing to say once the project isn't.
  useEffect(() => {
    if (state !== "saved") setOpen(false);
  }, [state]);

  if (state === "saving") {
    return (
      <span className={className} role="status" aria-label="Saving…" title="Saving…">
        <SpinnerIcon size={ICON_SIZE.md} />
      </span>
    );
  }

  if (state === "unsaved") {
    const label = signedIn ? "Save to Projects" : "Sign in to save to Projects";
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        title={disabled ? "Add a recipe first" : label}
        disabled={disabled}
        onClick={onSave}
      >
        <CloudDownloadIcon size={ICON_SIZE.lg} />
      </button>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={className}
        aria-label="Saved to Projects"
        title="Saved to Projects"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CloudCheckIcon size={ICON_SIZE.lg} />
      </button>
      {open && (
        <AnchoredMenu
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          label="Saved"
          align="end"
          className="rp-save-menu"
        >
          <div
            role="menuitem"
            aria-disabled="true"
            tabIndex={-1}
            className="cp-menu__item cp-menu__item--stacked rp-save-menu__row"
          >
            <span className="rp-save-menu__label">
              <CloudCheckIcon size={ICON_SIZE.md} />
              Changes saved
            </span>
            <span className="cp-menu__note">
              {savedAt ? `Last saved ${savedAgo(savedAt, now)}` : "Changes save automatically."}
            </span>
          </div>
        </AnchoredMenu>
      )}
    </>
  );
}
