"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE, PlusIcon } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/**
 * The page toolbar's "+": a short list of what this page can take, one row
 * each, down a single column. On a recipe ("Recipe details") it is every
 * line and field the recipe has, always in the same order, each saying
 * whether it's added (built in PrintDeck). Picking one opens it on the page,
 * ready to type. Opens under its button and keeps itself on screen, like
 * MoveToSectionMenu, whose shell this is.
 *
 * `page` is a whole page the "+" can add next to this one (a chapter's photo
 * page beside it), ruled off under the lines because it isn't one of them.
 */
/** Room kept clear below the panel, against the screen's bottom edge. */
const SCREEN_MARGIN_PX = 8;
/** Below this much room under the button, the panel moves up instead. */
const MIN_ROOM_PX = 200;

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
  /** "Recipe details" on a recipe, "Add to this page" on a book page. */
  heading: string;
  /** `hint` says where a recipe line stands ("Add", "Hidden"); none once it is on the card. */
  lines: { name: string; hint?: string; restore: () => void }[];
  page?: { name: string; add: () => void } | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Opens under its button. The heading stays put and the rows scroll in what
  // the screen has left below it, so a long list never pushes the panel up
  // over its button or off the bottom (Amelia, 2026-11-21). Only when there is
  // hardly any room below does the panel move up to make some.
  useLayoutEffect(() => {
    const node = ref.current;
    const list = listRef.current;
    if (!node || !list) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8))}px`;
    const top = Math.max(8, Math.min(anchor.y, window.innerHeight - MIN_ROOM_PX));
    node.style.top = `${top}px`;
    const chrome = node.getBoundingClientRect().height - list.getBoundingClientRect().height;
    list.style.maxHeight = `${Math.max(0, window.innerHeight - top - SCREEN_MARGIN_PX - chrome)}px`;
    updateMore();
  }, [anchor]);

  // While rows are hidden below, the list's foot fades out, so it reads as
  // scrollable rather than ending at a row that happens to be cut off.
  const [more, setMore] = useState(false);
  function updateMore() {
    const list = listRef.current;
    if (list) setMore(list.scrollTop + list.clientHeight < list.scrollHeight - 1);
  }

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
      <div
        ref={listRef}
        className={`add-line-menu__grid${more ? " add-line-menu__grid--more" : ""}`}
        onScroll={updateMore}
      >
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
            <span className="add-line-menu__name">{line.name}</span>
            {line.hint && (
              <span className={`add-line-menu__hint${line.hint === "Add" ? " add-line-menu__hint--add" : ""}`}>
                {/* A heavier stroke than the toolbar's, so it holds its own at
                    this size beside the word. */}
                {line.hint === "Add" && <PlusIcon size={ICON_SIZE.xs} strokeWidth={2.5} />}
                {line.hint}
              </span>
            )}
          </button>
        ))}
        {/* Inside the scrolling list, so the list holds the panel's bottom
            padding and nothing sits under it. */}
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
      </div>
    </div>,
    document.body,
  );
}
