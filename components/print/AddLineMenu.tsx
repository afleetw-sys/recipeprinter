"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE, PlusIcon } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/**
 * The page toolbar's "+": a small panel of what this page can take, one tile
 * each, in two columns: on a recipe its empty lines and the fields the theme
 * is hiding (lib/recipeMissingFields.ts). Picking one opens it on the page,
 * ready to type. Opens under its button and keeps itself on screen, like
 * MoveToSectionMenu, whose shell this is.
 *
 * `page` is a whole page the "+" can add next to this one (a chapter's photo
 * page beside it), ruled off under the lines because it isn't one of them.
 */
export function AddLineMenu({
  anchor,
  triggerRef,
  heading,
  lines,
  page = null,
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
  page?: { name: string; add: () => void } | null;
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
      <div className="add-line-menu__grid">
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
      </div>
      {page && lines.length > 0 && <div role="separator" className="add-line-menu__rule" />}
      {page && (
        <button
          type="button"
          role="menuitem"
          className="cp-menu__item"
          onClick={() => {
            onClose();
            page.add();
          }}
        >
          <PlusIcon size={ICON_SIZE.sm} />
          {page.name}
        </button>
      )}
    </div>,
    document.body,
  );
}
