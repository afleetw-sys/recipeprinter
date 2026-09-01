"use client";

import { useCallback, useRef, useState } from "react";
import { ICON_SIZE, MinusIcon, PlusIcon } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/**
 * The one zoom control.
 *
 * There were two, doing the same job in different shapes: the deck's (icon
 * buttons around a percentage that opens a list of preset steps) and the
 * full-page photo's (bare "−" and "+" text characters around a percentage that
 * did nothing when pressed, with no presets at all). Same gesture, same
 * meaning, two controls to learn — and the photo's was the poorer of the two
 * for no reason other than having been written separately.
 *
 * The deck's won. A caller supplies the range and what a step means; passing
 * `presets` turns the percentage into the menu, and omitting it leaves it as a
 * plain readout.
 */
export function ZoomControl({
  value,
  min,
  max,
  presets,
  presetNote,
  onStep,
  onSet,
  className,
  compact = false,
  label = "Zoom",
}: {
  value: number;
  min: number;
  max: number;
  /** Steps the percentage offers as a menu. Omit for a plain readout. */
  presets?: readonly number[];
  /** Annotates one preset, e.g. "Fit" beside 100%. */
  presetNote?: (preset: number) => string | undefined;
  onStep: (direction: 1 | -1) => void;
  onSet?: (value: number) => void;
  className?: string;
  /** Smaller, for floating on artwork rather than beside it. */
  compact?: boolean;
  label?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // The control rides whatever it zooms, so a scroll does not move it out from
  // under its own menu.
  useMenuDismiss(menuRef, closeMenu, { enabled: menuOpen, closeOnScroll: false });

  const percent = Math.round(value * 100);
  const canPick = Boolean(presets && onSet);

  return (
    <div
      className={`cp-zoom no-print ${compact ? "cp-zoom--compact" : ""} ${className ?? ""}`
        .replace(/\s+/g, " ")
        .trim()}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="cp-zoom__btn"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={value <= min}
        onClick={() => onStep(-1)}
      >
        <MinusIcon size={ICON_SIZE.sm} />
      </button>
      <div className="cp-zoom__picker" ref={menuRef}>
        {canPick ? (
          <button
            type="button"
            className="cp-zoom__value"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`${label}, ${percent} percent`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {percent}%
          </button>
        ) : (
          <span className="cp-zoom__value cp-zoom__value--static" aria-live="polite">
            {percent}%
          </span>
        )}
        {canPick && menuOpen && (
          <div className="cp-menu cp-zoom__menu" role="menu" aria-label={`${label} level`}>
            {presets?.map((step) => {
              const stepPercent = Math.round(step * 100);
              const note = presetNote?.(step);
              return (
                <button
                  key={step}
                  type="button"
                  role="menuitemradio"
                  aria-checked={percent === stepPercent}
                  className={`cp-menu__item cp-zoom__option ${percent === stepPercent ? "is-active" : ""}`}
                  onClick={() => {
                    onSet?.(step);
                    setMenuOpen(false);
                  }}
                >
                  {stepPercent}%
                  {note && <span className="cp-menu__note">{note}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className="cp-zoom__btn"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={value >= max}
        onClick={() => onStep(1)}
      >
        <PlusIcon size={ICON_SIZE.sm} />
      </button>
    </div>
  );
}
