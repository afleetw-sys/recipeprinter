"use client";

import { useId, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { CheckIcon, ChevronDownIcon, ICON_SIZE } from "@/components/icons";

/**
 * A pick-one dropdown drawn on the app's own popover surface.
 *
 * `Select` is the browser's control: our field box around a list the operating
 * system draws, which looks nothing like the menus the rest of the workspace
 * opens (sort, zoom, move to chapter). This is the same `cp-menu` those use,
 * behind a trigger that shows the current choice, closing the way they close.
 *
 * The list is an `AnchoredMenu`, so it is not confined to whatever holds the
 * trigger: it can hang past the edge of a dialog or a scrolling panel.
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const labelId = useId();
  const triggerId = useId();
  const current = options.find((option) => option.value === value);

  const choose = (next: T | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="menu-select">
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
      {open && (
        <AnchoredMenu
          anchorRef={triggerRef}
          onClose={() => setOpen(false)}
          label={label}
          align="end"
          className="menu-select__menu"
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
        </AnchoredMenu>
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
