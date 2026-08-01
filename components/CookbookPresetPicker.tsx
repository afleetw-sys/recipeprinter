"use client";

import { COOKBOOK_PRESETS } from "@/lib/cookbookPresets";
import type { CookbookPresetId } from "@/types/recipe";

/**
 * The cookbook print-format picker, shown in the Book Settings sidebar. Leads
 * with the product people are making (Spiral Cookbook / Hardcover Book) with
 * the trim size as a supporting detail — the geometry (bleed, margin, binding
 * gutter) is applied at export time from the chosen preset. Lives only in the
 * sidebar so it drives the live preview; the unlock dialog shows the choice as
 * a summary instead of a second picker.
 */
export function CookbookPresetPicker({
  value,
  onChange,
}: {
  value: CookbookPresetId;
  onChange: (id: CookbookPresetId) => void;
}) {
  return (
    <div className="recipe-config-section recipe-config-section--format">
      <span className="recipe-config-label" id="cookbook-format-label">
        Format
      </span>
      <div className="cookbook-format" role="radiogroup" aria-labelledby="cookbook-format-label">
        {COOKBOOK_PRESETS.map((preset) => (
          <label
            key={preset.id}
            className={`cookbook-format__tile ${value === preset.id ? "is-active" : ""}`}
          >
            <input
              type="radio"
              name="cookbook-format"
              className="sr-only"
              checked={value === preset.id}
              onChange={() => onChange(preset.id)}
            />
            <span className="cookbook-format__name">{preset.productName}</span>
            <span className="cookbook-format__trim">{preset.trimLabel}</span>
            <span className="cookbook-format__best">{preset.bestFor}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
