"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/**
 * The page toolbar's "+" menu: the lines this page has taken off, one row
 * each. Picking one puts that line back. Opens under its button and keeps
 * itself on screen, like MoveToSectionMenu, whose shell this is.
 */
export function AddLineMenu({
  anchor,
  triggerRef,
  heading,
  lines,
  onClose,
}: {
  /** Viewport coordinates to open at: the trigger's bottom-left corner. */
  anchor: { x: number; y: number };
  /** The "+" button: pressing it again closes the menu rather than counting
      as a press outside, which closed it and then reopened it. */
  triggerRef: RefObject<HTMLElement | null>;
  /** "Add to this recipe" on a recipe, "Add to this page" on a book page. */
  heading: string;
  lines: { name: string; restore: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8))}px`;
  }, [anchor]);

  useMenuDismiss([ref, triggerRef], onClose);

  return createPortal(
    <div
      ref={ref}
      className="cp-menu rail-tile-menu add-line-menu"
      role="menu"
      aria-label={heading}
      style={{ top: anchor.y, left: anchor.x }}
    >
      <p className="cp-menu__heading">{heading}</p>
      {lines.map((line) => (
        <button
          key={line.name}
          type="button"
          role="menuitem"
          className="cp-menu__item"
          onClick={() => {
            onClose();
            line.restore();
          }}
        >
          {line.name}
        </button>
      ))}
    </div>,
    document.body,
  );
}
