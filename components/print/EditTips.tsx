"use client";

import { useEffect, useState } from "react";

/** What is on offer while nothing is being typed into, and while something is.
    Two lists rather than one because "press return" is noise until a line is
    open, and "tap a line" is noise once one is. */
const IDLE_TIPS = ["Tap any line to edit it", "Pinch the page to zoom in"];
/** Only worth saying when there is somewhere to swipe to. */
const SWIPE_TIP = "Swipe sideways to move between pages";
const EDITING_TIPS = [
  "Press return to start a new line",
  "Select some words, then tap B or I to style them",
];

const DISMISSED_KEY = "rp-edit-tips-dismissed";
const LOADS_KEY = "rp-edit-tips-loads";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Held for the life of the page, so it is counted once per LOAD. A component
    can mount more than once in a load (React runs effects twice in development,
    and the strip remounts if the workspace does), and counting each of those
    would step past tips and, with an even number of them, land on the same one
    every visit. */
let loadNumber: number | null = null;

/**
 * Which visit this is, counted on this device. The tip is chosen from it, so
 * each load shows the next one along rather than a random pick that can repeat
 * itself twice running. Without storage it falls back to a random number, which
 * is as good as it can do.
 */
function thisLoadNumber(): number {
  if (loadNumber !== null) return loadNumber;
  try {
    const count = (Number.parseInt(window.localStorage.getItem(LOADS_KEY) ?? "0", 10) || 0) + 1;
    window.localStorage.setItem(LOADS_KEY, String(count));
    loadNumber = count;
  } catch {
    loadNumber = Math.floor(Math.random() * 1000);
  }
  return loadNumber;
}

/**
 * A single line of "how do I" above the phone's action bar, one of the things a
 * first-time editor does not know they can do.
 *
 * One per LOAD, not a rotation. A line that changes while you are reading it or
 * in the middle of a task is a distraction, and these are the wrong thing to be
 * distracted by. Each visit gets the next tip along and keeps it.
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
export function EditTips({
  editing,
  show,
  multiplePages,
}: {
  editing: boolean;
  show: boolean;
  multiplePages: boolean;
}) {
  // Unknown until mounted: `localStorage` does not exist on the server, and a
  // strip that renders and then vanishes is worse than one that appears.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [load, setLoad] = useState(0);
  const tips = editing ? EDITING_TIPS : multiplePages ? [...IDLE_TIPS, SWIPE_TIP] : IDLE_TIPS;

  useEffect(() => {
    setDismissed(readDismissed());
    setLoad(thisLoadNumber());
  }, []);

  if (!show || dismissed !== false) return null;

  return (
    <div className="recipe-edit-tips no-print" role="note">
      {/* Keyed on the text so the line plays its fade-in when it changes, which
          it does once: when a field is opened or closed and the two lists swap. */}
      <span key={`${editing}-${load}`} className="recipe-edit-tips__text">
        {tips[load % tips.length]}
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
