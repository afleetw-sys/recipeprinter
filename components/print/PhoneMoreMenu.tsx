"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { CloudCheckIcon, ICON_SIZE, MoreHorizontalIcon } from "@/components/icons";

/**
 * The phone top bar's "⋯": what the desktop header has room to say outright,
 * folded away, starting with whether the project is saved. A save that FAILED
 * is not in here; the page keeps that in the bar itself, because a failure is
 * the one save state someone has to see without looking for it.
 */
export function PhoneMoreMenu({
  saveState,
  onSave,
}: {
  /** Where saving stands, said at the end of the Save row. */
  saveState: string;
  /** What pressing Save does, when there is something to do. */
  onSave?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="icon-button rp-history-button rp-history-button--compact"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontalIcon size={ICON_SIZE.md} />
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="More" align="end" className="rp-phone-more-menu">
          <button
            type="button"
            role="menuitem"
            className="cp-menu__item"
            aria-disabled={onSave ? undefined : true}
            onClick={() => {
              if (!onSave) return;
              setOpen(false);
              onSave();
            }}
          >
            <CloudCheckIcon size={ICON_SIZE.md} />
            Save
            <span className="rp-phone-more-menu__state" role="status" aria-live="polite">
              {saveState}
            </span>
          </button>
        </AnchoredMenu>
      )}
    </>
  );
}
