"use client";

import { useEffect, useRef } from "react";
import type { PhotoStyle } from "@/lib/project";

const WITH_LAYOUT: Record<PhotoStyle, string> = {
  none: "without a photo",
  card: "with its photo in the page",
  full: "with a full-page photo",
};

export interface PhotoStyleTipState {
  mode: PhotoStyle;
}

/**
 * Shown under the "Every recipe" Photos tiles once a cook has set the same
 * layout on recipe after recipe from each page's own toolbar (see
 * lib/photoStyleStreak.ts). It sits in the section it is about, which is
 * highlighted while it shows, so "these" in the copy points at real controls.
 * Scrolls itself into view on arrival: the panel can be scrolled anywhere.
 */
export function PhotoStyleTip({
  tip,
  onAccept,
  onDismiss,
}: {
  tip: PhotoStyleTipState;
  onAccept: (mode: PhotoStyle) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.closest("[data-photo-style-section]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <div ref={ref} className="recipe-photo-style-tip" role="note">
      <p className="recipe-photo-style-tip__title">Want every recipe {WITH_LAYOUT[tip.mode]}?</p>
      <p className="recipe-photo-style-tip__body">
        These set the whole book at once. You can still change any one recipe from its page.
      </p>
      <div className="recipe-photo-style-tip__actions">
        <button type="button" className="btn btn-primary btn-compact" onClick={() => onAccept(tip.mode)}>
          Apply to every recipe
        </button>
        <button type="button" className="btn-ghost btn-compact" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
