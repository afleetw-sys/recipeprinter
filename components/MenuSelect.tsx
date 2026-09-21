"use client";

import { useCallback, useId, useRef, useState } from "react";
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
 * It opens under its trigger, inside whatever holds it, so it belongs in
 * places that can grow or scroll (a dialog); a control living in a clipping
 * panel would need it portalled instead.
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
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(ref, close, { enabled: open, closeOnScroll: false });
  const labelId = useId();
  const triggerId = useId();
  const current = options.find((option) => option.value === value);

  const choose = (next: T | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="menu-select" ref={ref}>
      <span id={labelId} className="menu-select__label">
        {label}
      </span>
      <button
        id={triggerId}
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
        <div className="cp-menu menu-select__menu" role="menu" aria-label={label}>
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
        </div>
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
      <span className="menu-select__check">{selected && <CheckIcon size={ICON_SIZE.sm} />}</span>
      {children}
    </button>
  );
}
