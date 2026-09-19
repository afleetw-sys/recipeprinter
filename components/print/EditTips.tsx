"use client";

import { useEffect, useState } from "react";
import { isDeckMobile } from "@/lib/useDeckScroller";

/** What is on offer while nothing is being typed into, and while something is.
    Two lists rather than one because "press return" is noise until a line is
    open, and "tap a line" is noise once one is. */
const IDLE_TIPS = [
  "Tap any line to edit it",
  "Pinch the page to zoom in",
  "Swipe sideways to move between pages",
];
const EDITING_TIPS = [
  "Press return to start a new line",
  "Select some words, then tap B or I to style them",
];

/** Long enough to read one line twice over; short enough that the strip is
    never the same thing for long. */
const TIP_INTERVAL_MS = 6_000;

const DISMISSED_KEY = "rp-edit-tips-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A single line of "how do I" above the phone's action bar, rotating through the
 * things a first-time editor does not know they can do.
 *
 * It lives in the action bar rather than over the page because that is the one
 * strip of the phone layout with room for text and nothing else in it: the card
 * fills the deck above, and a line of copy over the card is a line of copy over
 * the thing being edited. Being part of the bar means it also rides up with the
 * keyboard, which is when the editing tips are wanted.
 *
 * Quiet by construction. It waits for a recipe to be on the page, it is one
 * line, it never moves under a finger (the strip does not take pointer events,
 * only its own close button does), and once dismissed it stays dismissed.
 */
export function EditTips({ editing, show }: { editing: boolean; show: boolean }) {
  // Unknown until mounted: `localStorage` does not exist on the server, and a
  // strip that renders and then vanishes is worse than one that appears.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const tips = editing ? EDITING_TIPS : IDLE_TIPS;

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  // A different list starts from its first line, not from wherever the last one
  // had got to.
  useEffect(() => {
    setIndex(0);
  }, [editing]);

  const visible = show && dismissed === false;
  useEffect(() => {
    if (!visible || !isDeckMobile()) return;
    const timer = window.setInterval(() => {
      // Nothing to read while the tab is in the background.
      if (document.hidden) return;
      setIndex((current) => (current + 1) % tips.length);
    }, TIP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [visible, tips.length]);

  if (!visible) return null;

  return (
    <div className="recipe-edit-tips no-print" role="note">
      {/* Keyed on the text so each new line plays the fade-in once. */}
      <span key={`${editing}-${index}`} className="recipe-edit-tips__text">
        {tips[index % tips.length]}
      </span>
      <button
        type="button"
        className="recipe-edit-tips__dismiss"
        aria-label="Hide tips"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(DISMISSED_KEY, "1");
          } catch {
            // Hidden for this visit either way.
          }
        }}
      >
        ×
      </button>
    </div>
  );
}
