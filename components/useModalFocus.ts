"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null,
  );
}

export function useModalFocus(
  ref: RefObject<HTMLElement>,
  onClose: () => void,
  options: { disabled?: boolean; closeDisabled?: boolean } = {},
) {
  const { disabled = false, closeDisabled = false } = options;

  // Hold the callback + flag in refs so the focus-trap effect below depends only
  // on open/disabled — NOT on `onClose`'s identity. Callers routinely pass a
  // fresh `onClose` arrow every render; if that were a dep, the effect would
  // re-run every render, re-running its focus() call. Inside an editable surface
  // (a recipe card's inputs fire onFocus/onBlur → setState) that re-focus churn
  // ping-pongs into an infinite render loop and freezes the page.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (disabled) return;
    const root = ref.current;
    if (!root) return;
    const dialogRoot = root;

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = focusableElements(dialogRoot);
    (focusable[0] ?? dialogRoot).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const currentFocusable = focusableElements(dialogRoot);
      if (currentFocusable.length === 0) {
        event.preventDefault();
        dialogRoot.focus();
        return;
      }

      const first = currentFocusable[0]!;
      const last = currentFocusable[currentFocusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActive?.focus();
    };
  }, [ref, disabled]);
}
