"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/Controls";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";

/**
 * The one dialog for "are you sure?".
 *
 * There were two. The print workspace had its own — same question, same two
 * buttons, built on the `.print-success-dialog` panel — and the two drifted
 * exactly as far as you would expect: one centred its text and its buttons,
 * the other left-aligned the text and put the buttons on the right. Aligning
 * them by hand is what this replaces, because hand-alignment is how they came
 * apart the first time.
 *
 * Two things the print one needed that this now carries: extra content between
 * the question and the buttons (`children` — its "also delete the recipes in
 * this chapter" checkbox), and the option to focus the confirm button rather
 * than the X, so Enter commits.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  autoFocusConfirm = false,
  confirmLabel,
  busy = false,
  tone = "danger",
  confirmIcon,
  secondaryLabel,
  onSecondary,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
  /** Focus the confirm button on open instead of the X, so Enter commits.
      Off by default: on a destructive dialog that is a deliberate choice, not
      something every caller should get for free. */
  autoFocusConfirm?: boolean;
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "primary";
  confirmIcon?: ReactNode;
  /** The way out, in place of Cancel — "leave without saving" to a dialog
      whose confirm is "sign in and save it". Not a danger tone: leaving is a
      choice here, not a demolition. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // After the Dialog's own mount-time focus, which takes the first focusable
  // element (the X). A caller effect ordered after that one wins.
  useEffect(() => {
    if (open && autoFocusConfirm) confirmRef.current?.focus();
  }, [open, autoFocusConfirm]);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      labelledBy="confirm-dialog-title"
      className="fixed inset-0 z-50 grid place-items-center dialog-scrim p-cp-4"
      panelClassName="relative w-full max-w-md rounded-2xl border border-line bg-card p-cp-6 shadow-cp-lg"
      portal
    >
      <IconButton
        className="absolute right-3 top-3"
        aria-label="Close"
        disabled={busy}
        onClick={onCancel}
      >
        <XIcon size={ICON_SIZE.md} />
      </IconButton>
      <h2 id="confirm-dialog-title" className="pr-10 text-cp-dialog-title font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-cp-3 text-cp-body leading-relaxed text-ink-soft">{description}</div>
      {children}
      <div className="mt-cp-6 flex flex-wrap justify-end gap-cp-3">
        {/* A dialog with a third action doesn't need Cancel as well: the
            secondary IS the way out, and the X still closes. */}
        {secondaryLabel && onSecondary ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          ref={confirmRef}
          type="button"
          className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : confirmIcon}
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
