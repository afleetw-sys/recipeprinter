"use client";

import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/**
 * A `cp-menu` list that opens against a trigger and is never clipped by it.
 *
 * The rail's sort menu was absolutely positioned inside the rail, so the rail's
 * own scroll box cut it off at the edge. A menu that lives inside whatever holds
 * its trigger can only be as big as that thing. This one is portalled to the
 * body and placed from the trigger's rectangle, so it can hang past the edge of
 * a panel, a scroll area or a dialog, flips above the trigger when there is no
 * room below, and stays inside the window.
 *
 * It sits above dialogs (`.anchored-menu`): the shared menu layer is
 * deliberately below them, which is right for a menu opened from the page and
 * wrong for one opened from inside a dialog, and a menu should never be the
 * thing that is hidden. Only toasts are above it.
 *
 * Mount it while it is open. The caller owns the open state and the rows; this
 * owns where it goes, how it closes, and the arrow keys. Focus starts on the
 * chosen row (or the first) so an arrow key moves from where you are, and goes
 * back to the trigger when the menu closes from the keyboard.
 */
export function AnchoredMenu({
  anchorRef,
  onClose,
  label,
  align = "start",
  className = "",
  children,
}: {
  /** The trigger, or the element wrapping it: the menu opens against this. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  label?: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  const focusAnchor = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const target = anchor.matches("button, a, [tabindex]")
      ? anchor
      : anchor.querySelector<HTMLElement>("button, a, [tabindex]");
    target?.focus();
  }, [anchorRef]);

  // Closing hands focus back when it was inside the menu, so a keyboard user is
  // not left on a row that no longer exists.
  const close = useCallback(() => {
    if (menuRef.current?.contains(document.activeElement)) focusAnchor();
    onClose();
  }, [focusAnchor, onClose]);
  // The trigger and the menu are apart in the DOM, and pressing either is inside.
  useMenuDismiss([anchorRef, menuRef], close);

  // Measured after render because the menu's own size decides where it fits.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const at = anchor.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const wanted = align === "end" ? at.right - size.width : at.left;
    const left = Math.max(margin, Math.min(wanted, window.innerWidth - size.width - margin));
    const below = at.bottom + gap;
    const top =
      below + size.height > window.innerHeight - margin
        ? Math.max(margin, at.top - gap - size.height)
        : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    (menu.querySelector<HTMLElement>('[role^="menuitem"][aria-checked="true"]') ??
      menu.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  }, [anchorRef, align]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
    );
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      rows[(at + step + rows.length) % rows.length]?.focus();
    } else if (event.key === "Tab") {
      // A dialog's focus trap only knows its own subtree, so leaving by Tab goes
      // back to the trigger instead of out of the page.
      event.preventDefault();
      event.stopPropagation();
      focusAnchor();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className={`cp-menu anchored-menu ${className}`.trim()}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}
