"use client";

import { toggleRichText } from "@/lib/richText";

/**
 * Applies bold/italic to whatever is selected in a live text field.
 *
 * Shared by the two ways in — Cmd+B/Cmd+I inside the field, and the toolbar's
 * buttons — so the keyboard and the bar cannot disagree about what a toggle
 * does.
 *
 * The selection is restored on the next frame because the field is controlled:
 * React has to render the new value before the caret can be put back, and
 * without this a wrap left the cursor sitting inside the markers it had just
 * added.
 */
export function applyRichTextToField(
  field: HTMLInputElement | HTMLTextAreaElement,
  style: "bold" | "italic",
  onValueChange: (value: string) => void,
): void {
  const next = toggleRichText(
    field.value,
    field.selectionStart ?? field.value.length,
    field.selectionEnd ?? field.value.length,
    style,
  );
  onValueChange(next.value);
  requestAnimationFrame(() => {
    // The field can be gone by now — a commit, a page change — and asking a
    // detached node for a selection throws in some browsers.
    if (!field.isConnected) return;
    field.setSelectionRange(next.selectionStart, next.selectionEnd);
  });
}

/** The focused inline field, or null when focus is somewhere else entirely.
    The toolbar reads this: its buttons `preventDefault` on mousedown, so focus
    is still in the field they are acting on. */
export function focusedInlineField(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return active;
  return null;
}
