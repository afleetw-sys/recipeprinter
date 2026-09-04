"use client";

import { nodesToRichText } from "@/lib/richText";

/**
 * Bold/italic applied to the field that currently has focus.
 *
 * The toolbar's buttons `preventDefault` on mousedown, so focus never leaves
 * the field they act on — which is what lets this find it at all, and why the
 * bar and Cmd+B end up doing exactly the same thing through exactly the same
 * browser command.
 */
export function applyStyleToFocusedField(style: "bold" | "italic"): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.isContentEditable) return false;
  document.execCommand(style);
  return true;
}

/** Whether a rich field has focus — the toolbar group only belongs on screen
    while one does. */
export function hasFocusedRichField(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return active instanceof HTMLElement && active.isContentEditable;
}

/** The marker text currently in the focused rich field, or null when focus is
    elsewhere.

    The toolbar needs this because the field is uncontrolled: React's copy of
    the value is whatever the edit STARTED as, so a control that rebuilt the
    line from state would throw away everything typed since. Reading the DOM is
    reading the truth. */
export function readFocusedRichField(): string | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.isContentEditable) return null;
  return nodesToRichText(active);
}
