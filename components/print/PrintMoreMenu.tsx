"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { BookIcon, ICON_SIZE, MoreHorizontalIcon, PrintIcon, RedoIcon, UndoIcon } from "@/components/icons";

/** Undo and redo, when the bar has folded them in here (`useHistoryFold`). */
export interface FoldedHistory {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * The /print header's "⋯", desktop and phone: things to do with the whole
 * job that have no button of their own. Recipe cards' "Make a cookbook", a
 * cookbook's "Print as recipe cards", and on a phone, undo and redo when the
 * bar has no room for them.
 *
 * Saving used to live here too. It is the cloud beside it now
 * (`SaveCloudButton`, Amelia, 2026-11-22), the same on both layouts, so this
 * only shows when it has one of the rows above to hold (`hasPrintMoreRows`).
 */
export function PrintMoreMenu({
  size,
  history,
  printAsCards,
  makeCookbook,
}: {
  /** The bar it sits in: `SiteHeader`'s 32px controls or the phone's 30px. */
  size: "header" | "compact";
  /** Present only when undo and redo have no room in the bar. */
  history?: FoldedHistory;
  /** A cookbook's "Print as recipe cards" (see PrintAsCardsDialog). */
  printAsCards?: () => void;
  /** Recipe cards' "Make a cookbook": a new book with these recipes. */
  makeCookbook?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = () => setOpen(false);
  const rule = <div className="rp-save-menu__rule" role="separator" />;

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
            </>
          )}
          {makeCookbook && (
            <>
              {history && rule}
              <button
                type="button"
                role="menuitem"
                className="cp-menu__item cp-menu__item--stacked"
                onClick={() => {
                  close();
                  makeCookbook();
                }}
              >
                <span className="rp-save-menu__label">
                  <BookIcon size={ICON_SIZE.md} />
                  Make a cookbook
                </span>
                <span className="cp-menu__note">Start a cookbook with these recipes.</span>
              </button>
            </>
          )}
          {printAsCards && (
            <>
              {(history || makeCookbook) && rule}
              <button
                type="button"
                role="menuitem"
                className="cp-menu__item cp-menu__item--stacked"
                onClick={() => {
                  close();
                  printAsCards();
                }}
              >
                <span className="rp-save-menu__label">
                  <PrintIcon size={ICON_SIZE.md} />
                  Print as recipe cards
                </span>
                <span className="cp-menu__note">Choose recipes from this cookbook.</span>
              </button>
            </>
          )}
        </AnchoredMenu>
      )}
    </>
  );
}
