import { useEffect, useState } from "react";

/** How long a toast stays up before it dismisses itself. */
export const TOAST_DURATION_MS = 5200;

export type ToastTone = "info" | "error";

/**
 * The print page's one toast: a message, how long it lives, and how to clear it.
 *
 * Pulled out of app/print/page.tsx unchanged. `showToast` and `clearToast` are
 * plain functions, not `useCallback`s, on purpose: on the page they were a fresh
 * function every render, and the purchase hooks they are handed to were written
 * against that. Making them stable would be a change to those hooks' effects,
 * not a tidy-up, so it does not belong in a move.
 */
export function useToast() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** Whether the toast is reporting a FAILURE or just confirming something.
      Only `showErrorToast` sets "error"; `showToast` puts it back to "info". */
  const [toastTone, setToastTone] = useState<ToastTone>("info");

  // Keyed on the message: a new message restarts the clock, but showing the
  // same text again while it is still up does not.
  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  function showToast(message: string) {
    setToastMessage(message);
    setToastTone("info");
  }

  /** A failure the cook needs to notice: red, and announced assertively to
      screen readers. Import failures do not come through here (they hold their
      own page); sign-in and purchase failures do. */
  function showErrorToast(message: string) {
    setToastMessage(message);
    setToastTone("error");
  }

  function clearToast() {
    setToastMessage(null);
  }

  return {
    toastMessage,
    setToastMessage,
    toastTone,
    setToastTone,
    showToast,
    showErrorToast,
    clearToast,
  };
}
