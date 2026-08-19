"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/Controls";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "danger",
  confirmIcon,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "primary";
  confirmIcon?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      labelledBy="confirm-dialog-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-cp-4"
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
      <div className="mt-cp-6 flex flex-wrap justify-end gap-cp-3">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
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
