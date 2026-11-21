"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon, ICON_SIZE, PlusIcon, SettingsIcon } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/** Room kept clear below the panel, against the screen's bottom edge. */
const SCREEN_MARGIN_PX = 8;
/** Below this much room under the button, the panel moves up instead. */
const MIN_ROOM_PX = 200;

/** One switch in "Show on recipes". */
export interface FieldVisibilityRow {
  name: string;
  checked: boolean;
  /** A quiet line under the name, when the switch needs one. */
  hint?: string;
  onChange: (shown: boolean) => void;
}

/**
 * The page toolbar's "+". On a recipe it is "Recipe details": every line and
 * field the recipe has, always in the same order, each a plain row; picking
 * one adds it or opens it on the card, ready to type (built in PrintDeck).
 * On a book page it is "Add to this page": the lines the page has taken off.
 *
 * `settings` puts a gear in a recipe's header, which turns the same popover
 * into "Show on recipes": a switch per optional field, for the current theme,
 * and a back button (Amelia, 2026-11-21). It is the one place a field is shown
 * or hidden; hiding never deletes what the field holds.
 *
 * Opens under its button and keeps itself on screen, like MoveToSectionMenu,
 * whose shell this is. `page` is a whole page the "+" can add next to this
 * one (a chapter's photo page beside it), ruled off under the lines.
 */
export function AddLineMenu({
  anchor,
  triggerRef,
  heading,
  lines,
  page = null,
  settings = null,
  onClose,
}: {
  /** Viewport coordinates to open at: the trigger's bottom-left corner. */
  anchor: { x: number; y: number };
  /** The "+" button: pressing it again closes the menu rather than counting
      as a press outside, which closed it and then reopened it. */
  triggerRef: RefObject<HTMLElement | null>;
  /** "Recipe details" on a recipe, "Add to this page" on a book page. */
  heading: string;
  lines: { name: string; restore: () => void }[];
  page?: { name: string; add: () => void } | null;
  /** "Show on recipes": `scope` names what the switches apply to. */
  settings?: { scope: string; rows: FieldVisibilityRow[] } | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<"list" | "settings">("list");

  // Opens under its button. The heading stays put and the rows scroll in what
  // the screen has left below it, so a long list never pushes the panel up
  // over its button or off the bottom (Amelia, 2026-11-21). Only when there is
  // hardly any room below does the panel move up to make some.
  useLayoutEffect(() => {
    const node = ref.current;
    const list = listRef.current;
    if (!node || !list) return;
    list.style.maxHeight = "";
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8))}px`;
    const top = Math.max(8, Math.min(anchor.y, window.innerHeight - MIN_ROOM_PX));
    node.style.top = `${top}px`;
    const chrome = node.getBoundingClientRect().height - list.getBoundingClientRect().height;
    list.style.maxHeight = `${Math.max(0, window.innerHeight - top - SCREEN_MARGIN_PX - chrome)}px`;
    updateMore();
  }, [anchor, view]);

  // While rows are hidden below, the list's foot fades out, so it reads as
  // scrollable rather than ending at a row that happens to be cut off.
  const [more, setMore] = useState(false);
  function updateMore() {
    const list = listRef.current;
    if (list) setMore(list.scrollTop + list.clientHeight < list.scrollHeight - 1);
  }

  useMenuDismiss([ref, triggerRef], onClose);

  const listClass = `add-line-menu__grid${more ? " add-line-menu__grid--more" : ""}`;

  return createPortal(
    <div
      ref={ref}
      className="cp-menu rail-tile-menu add-line-menu"
      role="menu"
      aria-label={view === "settings" ? "Show on recipes" : heading}
      style={{ top: anchor.y, left: anchor.x }}
    >
      {view === "settings" && settings ? (
        <>
          <div className="add-line-menu__head">
            <button
              type="button"
              className="add-line-menu__back"
              onClick={() => setView("list")}
              aria-label={`Back to ${heading}`}
            >
              <ChevronLeftIcon size={ICON_SIZE.sm} />
              <span className="cp-menu__heading">Show on recipes</span>
            </button>
          </div>
          <p className="add-line-menu__scope">{settings.scope}</p>
          <div ref={listRef} className={listClass} onScroll={updateMore}>
            {settings.rows.map((row) => (
              <label key={row.name} className="cp-menu__item add-line-menu__switch-row">
                <span className="add-line-menu__name">
                  {row.name}
                  {row.hint && <span className="add-line-menu__switch-hint">{row.hint}</span>}
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="add-line-menu__switch"
                  checked={row.checked}
                  onChange={(event) => row.onChange(event.target.checked)}
                />
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="add-line-menu__head">
            <p className="cp-menu__heading">{heading}</p>
            {settings && (
              <button
                type="button"
                className="add-line-menu__gear"
                onClick={() => setView("settings")}
                aria-label="Show on recipes"
                title="Show on recipes"
              >
                <SettingsIcon size={ICON_SIZE.sm} />
              </button>
            )}
          </div>
          <div ref={listRef} className={listClass} onScroll={updateMore}>
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
        </>
      )}
    </div>,
    document.body,
  );
}
