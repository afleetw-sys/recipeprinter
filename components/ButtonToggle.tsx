"use client";

import type { ComponentType, ReactNode } from "react";

/**
 * The app's segmented picker: a row of equal buttons where exactly one is
 * chosen.
 *
 * It exists because there were two of these with the same markup and different
 * appearances — the import switch on the homepage and the identical switch
 * inside the Add-recipe dialog, which diverged because one of them carried a
 * panel-scoped background override. Whichever looked "right" was an accident of
 * which surface you happened to be on.
 *
 * The chosen segment is marked by its edge and its label going accent, never by
 * a fill. See the `.btn-toggle` note in globals.css for why this is the one
 * control that skips `--cp-selected-fill`, and docs/color-roles.md for where
 * each treatment belongs.
 *
 * LAYOUT IS THE CALLER'S. The group is a bare grid; pass `className` with the
 * `grid-template-columns` the surface needs. Trying to absorb that here meant
 * a `columns` prop that could not express "two equal, then a 44px overflow
 * button", which is exactly what the import switch needs.
 *
 * `children` renders after the options, inside the same grid — for a trailing
 * control that belongs to the row but is not one of its options (again, the
 * import switch's overflow menu).
 */
export type ButtonToggleOption<T extends string> = {
  id: T;
  label: string;
  /** Rendered at 18px before the label. */
  icon?: ComponentType<{ size?: number }>;
};

export function ButtonToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  className = "",
  optionClassName = "",
  children,
}: {
  options: ReadonlyArray<ButtonToggleOption<T>>;
  value: T | null;
  onChange: (id: T) => void;
  /** Names the group for screen readers. */
  label: string;
  disabled?: boolean;
  /** Goes on the grid — this is where `grid-template-columns` belongs. */
  className?: string;
  optionClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`btn-toggle ${className}`.trim()} role="group" aria-label={label}>
      {options.map(({ id, label: optionLabel, icon: Icon }) => (
        <button
          key={id}
          type="button"
          // aria-pressed, not aria-checked: these are buttons in a group, not
          // radios in a fieldset, and the group has no single required answer
          // in every caller.
          aria-pressed={value === id}
          disabled={disabled}
          className={`btn-toggle__option ${value === id ? "is-active" : ""} ${optionClassName}`.trim()}
          onClick={() => onChange(id)}
        >
          {Icon ? <Icon size={18} /> : null}
          <span>{optionLabel}</span>
        </button>
      ))}
      {children}
    </div>
  );
}
