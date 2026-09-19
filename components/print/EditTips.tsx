"use client";

import { useEffect, useState } from "react";

/** What is on offer while nothing is being typed into, and while something is.
    Two lists rather than one because "press return" is noise until a line is
    open, and "tap a line" is noise once one is. */
const IDLE_TIPS = ["Tap any line to edit it", "Pinch the page to zoom in"];
const EDITING_TIPS = ["Press return to start a new line"];

const LOADS_KEY = "rp-edit-tips-loads";

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
 * A single line of "how do I" on the artboard under the page being edited, one
 * of the things a first-time editor does not know they can do.
 *
 * One per LOAD, not a rotation. A line that changes while you are reading it or
 * in the middle of a task is a distraction, and these are the wrong thing to be
 * distracted by. Each visit gets the next tip along and keeps it.
 *
 * It hangs off the bottom edge of the active page rather than sitting in the
 * action bar, so it belongs to the artboard: zoom in and it travels with the
 * page and leaves the frame, instead of staying pinned over a card that has
 * grown past it. It is rendered by the active slide (see PrintDeck), which is
 * also why it needs no "is there a recipe" check of its own.
 *
 * Quiet by construction: one italic line that takes no pointer events, so it
 * can never eat a tap meant for the page.
 */
export function EditTips({ editing }: { editing: boolean }) {
  // Unknown until mounted: `localStorage` does not exist on the server, so the
  // load number can only be read on the client, and a strip that renders with
  // the wrong tip and then swaps is worse than one that appears.
  const [load, setLoad] = useState<number | null>(null);
  const tips = editing ? EDITING_TIPS : IDLE_TIPS;

  useEffect(() => {
    setLoad(thisLoadNumber());
  }, []);

  if (load === null) return null;

  return (
    <div className="recipe-edit-tips no-print" role="note">
      {/* Keyed on the text so the line plays its fade-in when it changes, which
          it does once: when a field is opened or closed and the two lists swap. */}
      <span key={`${editing}-${load}`} className="recipe-edit-tips__text">
        {tips[load % tips.length]}
      </span>
    </div>
  );
}
