"use client";

import { useId, type CSSProperties } from "react";
import { ProBadge } from "@/components/ProBadge";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALES,
  FONT_SCALE_LABELS,
  type FontScale,
} from "@/lib/fontScale";

/**
 * The cook's text size for every recipe page, picked from a list of words
 * (Smallest … Largest), never a percentage: nobody knows what 92% looks like.
 *
 * Normal is free; every other size is Pro on recipe cards. Like a Pro theme or
 * the 4×6 size, a free account can still pick and preview one: the crown marks
 * it and only Print asks for Pro (`fontScaleLocked`).
 *
 * The settings panel's text size: a slider over the five steps, with the
 * step's name across from the heading. Steps, never a free value: every one
 * is measured by the layout harness.
 */
export function TextSizeControl({
  fontScale,
  setFontScale,
  proMarked,
}: {
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  /** Crown every size but Normal: recipe cards on a free account. */
  proMarked: boolean;
}) {
  return (
    <StepSizeControl
      label="Text size"
      steps={FONT_SCALES}
      labels={FONT_SCALE_LABELS}
      value={fontScale}
      defaultValue={DEFAULT_FONT_SCALE}
      onChange={setFontScale}
      proMarked={proMarked}
      proTooltip="This text size is Pro"
    />
  );
}

/**
 * A size picked from a few named steps: a slider over them, the step's name
 * across from the heading, and a crown on any step but the default when
 * `proMarked`. Text size and photo size share it, so the two read as one kind
 * of setting (Amelia, 2026-11-04: photo size was a dropdown).
 */
export function StepSizeControl<T extends number>({
  label,
  steps,
  labels,
  value,
  defaultValue,
  onChange,
  proMarked,
  proTooltip,
}: {
  label: string;
  steps: readonly T[];
  labels: Record<T, string>;
  value: T;
  defaultValue: T;
  onChange: (value: T) => void;
  proMarked: boolean;
  proTooltip: string;
}) {
  const labelId = useId();
  const index = steps.indexOf(value);
  const position = index < 0 ? steps.indexOf(defaultValue) : index;
  return (
    <div className="recipe-config-section recipe-config-section--text-size">
      <div className="recipe-text-size__head">
        <span className="recipe-config-label" id={labelId}>
          {label}
        </span>
        <span className="recipe-text-size__name">
          {proMarked && value !== defaultValue && <ProBadge variant="inline" label={false} tooltip={proTooltip} />}
          {labels[value]}
        </span>
      </div>
      <div
        className="recipe-text-size__slider"
        style={{ "--fill": `${(position / (steps.length - 1)) * 100}%` } as CSSProperties}
      >
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={position}
          aria-labelledby={labelId}
          aria-valuetext={labels[value]}
          onChange={(event) => onChange(steps[Number(event.target.value)] ?? defaultValue)}
        />
        <span className="recipe-text-size__ticks" aria-hidden>
          {steps.map((step, i) => (
            <span key={step} className={i === position ? "is-selected" : undefined} />
          ))}
        </span>
      </div>
    </div>
  );
}
