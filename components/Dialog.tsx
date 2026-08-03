"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/components/useModalFocus";

let openDialogCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

function lockPageScroll() {
  if (openDialogCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  openDialogCount += 1;
}

function unlockPageScroll() {
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
}

/**
 * The shared shell for every modal in the app.
 *
 * What this unifies is the *contract*, not the look: the ARIA wiring
 * (`role`/`aria-modal`/`aria-labelledby`/`tabIndex={-1}`), the root ref, the
 * `useModalFocus` focus trap, and the backdrop element. Ten dialogs across six
 * files were each restating that by hand, and they had drifted — some passed
 * `disabled` to the focus hook and some didn't, so a couple kept trapping Tab
 * while closed.
 *
 * Deliberately NOT unified: the panel's own styling. These modals legitimately
 * differ — a full-height "Add recipe" sheet is not a small delete confirm — and
 * they're split across two styling systems (BEM classes in print.css for the
 * print-page ones, Tailwind utilities for the auth/feedback ones). Forcing one
 * visual shell would have meant redesigning six dialogs to remove some
 * duplicated attributes, which is a much larger and riskier change than the
 * problem justifies. Callers pass their own `className`/`panelClassName` and
 * keep exactly the appearance they have today.
 *
 * Callers that need focus somewhere other than the first focusable element
 * (the delete confirm wants its Delete button; feedback wants its message
 * field) keep doing that with their own ref and effect — `useModalFocus`
 * focuses on mount, and a caller effect ordered after it wins.
 */
export function Dialog({
  open = true,
  onClose,
  closeDisabled = false,
  labelledBy,
  label,
  dismissOnBackdropClick = false,
  className,
  backdropClassName,
  panelClassName,
  portal = false,
  children,
}: {
  /** Omit for dialogs the parent already renders conditionally. */
  open?: boolean;
  onClose: () => void;
  /** Blocks Escape-to-close while an operation is in flight. */
  closeDisabled?: boolean;
  /** id of the element naming this dialog. Prefer this over `label` when the
      dialog already renders a visible heading. */
  labelledBy?: string;
  /** Literal accessible name, for dialogs with no single heading element. */
  label?: string;
  /** Close when the backdrop itself is pressed. Off by default because it
      wasn't universal before this shell existed and silently adding it to
      every dialog would let a stray click discard in-progress work — the
      "Add recipe" import form especially. */
  dismissOnBackdropClick?: boolean;
  /** Class on the fixed-position root. */
  className?: string;
  /** Class on the backdrop. Omit for dialogs whose root paints its own. */
  backdropClassName?: string;
  /** Class on the content panel inside the backdrop. */
  panelClassName?: string;
  /** Render into `document.body`, escaping any transformed/clipped ancestor. */
  portal?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Called before the early return below so hook order stays stable across
  // open/closed renders; `disabled` is what actually makes it inert.
  useModalFocus(ref, onClose, { disabled: !open, closeDisabled });

  // Portals need a real DOM to target, which doesn't exist during SSR or the
  // first hydration pass.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    lockPageScroll();
    return unlockPageScroll;
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      ref={ref}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
      tabIndex={-1}
      // mousedown, not click: a click that *starts* inside the panel and
      // finishes on the backdrop (releasing after a text selection drag) would
      // otherwise read as a backdrop click and close the dialog mid-edit.
      onMouseDown={
        dismissOnBackdropClick
          ? (event) => {
              if (event.target === event.currentTarget && !closeDisabled) onClose();
            }
          : undefined
      }
    >
      {backdropClassName && <div className={backdropClassName} aria-hidden />}
      {panelClassName ? <div className={panelClassName}>{children}</div> : children}
    </div>
  );

  if (!portal) return dialog;
  return mounted ? createPortal(dialog, document.body) : null;
}
