"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { CheckIcon, CloudCheckIcon, ICON_SIZE, MoreHorizontalIcon, RedoIcon, SpinnerIcon, UndoIcon } from "@/components/icons";

export type SaveMenuState = "unsaved" | "saving" | "saved";

/** Undo and redo, when the bar has folded them in here (`useHistoryFold`). */
export interface FoldedHistory {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * The "⋯" in the /print header, desktop and phone alike, and always there,
 * whatever the job holds (Amelia, 2026-11-13). It is the one door to keeping a
 * job the automatic save would not keep on its own: a single recipe card.
 *
 * The automatic rule is unchanged (a cookbook, or a second card, is kept for a
 * signed-in cook without asking). This only adds a way to ask sooner. Pressing
 * "Save to Projects" is the same explicit save as everywhere else: signed out
 * it goes to sign-in and the save carries on after, signed in it writes the
 * project, and from then on the ordinary autosave owns it.
 *
 * Why "Save to Projects" and not "Turn on autosave": autosave isn't a switch
 * here, there is no way to turn it off again, and a label that reads like a
 * toggle invites the cook to look for one. Saving is what they're doing; that
 * it keeps saving is what the note under it, and the first-save toast, say.
 *
 * A save that FAILED is not in here: the page keeps that in the bar itself,
 * because a failure is the one save state someone has to see without looking.
 */
export function SaveMoreMenu({
  state,
  onSave,
  disabled = false,
  size,
  history,
}: {
  state: SaveMenuState;
  /** Starts the first save (or sign-in, signed out). */
  onSave: () => void;
  /** Nothing to save yet: an empty deck. */
  disabled?: boolean;
  /** The bar it sits in: `SiteHeader`'s 32px controls or the phone's 30px. */
  size: "header" | "compact";
  /** Present only when undo and redo have no room in the bar. */
  history?: FoldedHistory;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = () => setOpen(false);

  let row;
  if (state === "saved") {
    row = (
      <div role="menuitem" aria-disabled="true" className="cp-menu__item cp-menu__item--stacked rp-save-menu__row">
        <span className="rp-save-menu__label">
          <CheckIcon size={ICON_SIZE.md} />
          Saved
        </span>
        <span className="cp-menu__note">Changes save automatically.</span>
      </div>
    );
  } else if (state === "saving") {
    row = (
      <div role="menuitem" aria-disabled="true" className="cp-menu__item rp-save-menu__row">
        <span className="rp-save-menu__label" role="status" aria-live="polite">
          <SpinnerIcon size={ICON_SIZE.md} />
          Saving…
        </span>
      </div>
    );
  } else {
    row = (
      <button
        type="button"
        role="menuitem"
        className="cp-menu__item cp-menu__item--stacked"
        disabled={disabled}
        onClick={() => {
          close();
          onSave();
        }}
      >
        <span className="rp-save-menu__label">
          <CloudCheckIcon size={ICON_SIZE.md} />
          Save to Projects
        </span>
        <span className="cp-menu__note">
          {disabled ? "Add a recipe first." : "Changes will save automatically."}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`icon-button rp-history-button rp-history-button--${size}`}
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontalIcon size={ICON_SIZE.md} />
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={close} label="More" align="end" className="rp-save-menu">
          {history && (
            <>
              {/* Closes after, like any menu row; pressing again is one more
                  tap on ⋯, and ⌘Z still works without the menu. */}
              <button
                type="button"
                role="menuitem"
                className="cp-menu__item"
                disabled={!history.canUndo}
                onClick={() => {
                  close();
                  history.onUndo();
                }}
              >
                <UndoIcon size={ICON_SIZE.md} />
                Undo
              </button>
              <button
                type="button"
                role="menuitem"
                className="cp-menu__item"
                disabled={!history.canRedo}
                onClick={() => {
                  close();
                  history.onRedo();
                }}
              >
                <RedoIcon size={ICON_SIZE.md} />
                Redo
              </button>
              <div className="rp-save-menu__rule" role="separator" />
            </>
          )}
          {row}
        </AnchoredMenu>
      )}
    </>
  );
}
