"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, ICON_SIZE } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/**
 * A pick-one dropdown drawn on the app's own popover surface.
 *
 * `Select` is the browser's control: our field box around a list the operating
 * system draws, which looks nothing like the menus the rest of the workspace
 * opens (sort, zoom, move to chapter). This is the same `cp-menu` those use,
 * behind a trigger that shows the current choice, closing the way they close.
 *
 * The list is portalled to the body and placed from the trigger, so it is not
 * confined to whatever holds the trigger: it can hang past the edge of a dialog
 * or a scrolling panel, and flips above the trigger when there is no room below.
 * It sits above dialogs, which the shared menu layer deliberately does not.
 */
export function MenuSelect<T extends string>({
  label,
  placeholder,
  value,
  options,
  onChange,
  clearLabel,
  disabled = false,
}: {
  /** Names the control for people and screen readers, e.g. "Fill in for". */
  label: string;
  /** Shown on the trigger while nothing is chosen. */
  placeholder: string;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T | null) => void;
  /** Adds a first row that clears the choice. Omit where there is always one. */
  clearLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Closing hands focus back to the trigger when it was inside the menu, so a
  // keyboard user is not left on a row that no longer exists.
  const close = useCallback(() => {
    if (menuRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setOpen(false);
  }, []);
  // The trigger and the menu are apart in the DOM, and pressing either is inside.
  useMenuDismiss([wrapRef, menuRef], close, { enabled: open });

  // Under the trigger, right edges aligned, kept inside the viewport, and above
  // it instead when the room below runs out. Measured after render because the
  // menu's own size is what decides.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const anchor = trigger.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const left = Math.max(margin, Math.min(anchor.right - size.width, window.innerWidth - size.width - margin));
    const below = anchor.bottom + gap;
    const top =
      below + size.height > window.innerHeight - margin
        ? Math.max(margin, anchor.top - gap - size.height)
        : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    // Start on the current choice so an arrow key moves from where you are.
    (menu.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menu.querySelector<HTMLElement>("[role=menuitemradio]"))?.focus();
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]"),
    );
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      rows[(at + step + rows.length) % rows.length]?.focus();
    } else if (event.key === "Tab") {
      // The dialog's focus trap only knows its own subtree, so leaving the
      // menu by Tab goes back to the trigger instead of out of the page.
      event.preventDefault();
      // Handled here, so the dialog's own Tab trap does not also move focus.
      event.stopPropagation();
      triggerRef.current?.focus();
      setOpen(false);
    }
  };
  const labelId = useId();
  const triggerId = useId();
  const current = options.find((option) => option.value === value);

  const choose = (next: T | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="menu-select" ref={wrapRef}>
      <span id={labelId} className="menu-select__label">
        {label}
      </span>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        className="menu-select__trigger"
        aria-labelledby={`${labelId} ${triggerId}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span>{current ? current.label : placeholder}</span>
        <ChevronDownIcon size={ICON_SIZE.sm} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="cp-menu menu-select__menu"
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
          >
            {clearLabel && (
              <MenuRow selected={value === null} onSelect={() => choose(null)}>
                {clearLabel}
              </MenuRow>
            )}
            {options.map((option) => (
              <MenuRow
                key={option.value}
                selected={option.value === value}
                onSelect={() => choose(option.value)}
              >
                {option.label}
              </MenuRow>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={`cp-menu__item${selected ? " is-active" : ""}`}
      onClick={onSelect}
    >
      {children}
      {/* On the right, in a slot that is always there, so the labels line up
          whether or not a row is the chosen one. */}
      <span className="menu-select__check">{selected && <CheckIcon size={ICON_SIZE.sm} />}</span>
    </button>
  );
}
