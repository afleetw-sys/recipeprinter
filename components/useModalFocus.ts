"use client";

import { useEffect, type RefObject } from "react";

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
        if (!closeDisabled) onClose();
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
  }, [ref, onClose, disabled, closeDisabled]);
}
