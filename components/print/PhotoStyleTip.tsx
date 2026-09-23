"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PhotoStyle } from "@/lib/project";

/** What we noticed, per layout. Says what they were doing, not that they
    were doing it the long way. */
const NOTICED: Record<PhotoStyle, string> = {
  none: "Looks like you're removing recipe photos one at a time.",
  card: "Looks like you're moving recipe photos into the page one at a time.",
  full: "Looks like you're giving recipes a full-page photo one at a time.",
};

export interface PhotoStyleTipState {
  mode: PhotoStyle;
  /** Where the Photos section it points at is showing: the desktop panel, or
      the phone's "Every recipe" sheet. Both are always mounted (the panel is
      only moved off-screen on a phone), so the tip has to be told which one,
      or the hidden copy spotlights a section nobody can see and its scrim
      covers the whole screen. */
  surface: "panel" | "sheet";
}

/** Room left around the section inside the spotlight's opening. */
const SPOTLIGHT_PAD = 8;
const SPOTLIGHT_RADIUS = 14;

/**
 * The scrim's shape: the whole screen, minus a rounded opening over `rect`.
 * `evenodd` is what makes the inner shape a hole, and a clip-path hole is also
 * a hole for the pointer, so the section inside stays clickable while a click
 * anywhere on the dimmed part lands on the scrim.
 */
function spotlightPath(rect: DOMRect): string {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = rect.left - SPOTLIGHT_PAD;
  const y = rect.top - SPOTLIGHT_PAD;
  const rw = rect.width + SPOTLIGHT_PAD * 2;
  const rh = rect.height + SPOTLIGHT_PAD * 2;
  const r = Math.min(SPOTLIGHT_RADIUS, rw / 2, rh / 2);
  return (
    `M0 0H${w}V${h}H0Z ` +
    `M${x + r} ${y}H${x + rw - r}A${r} ${r} 0 0 1 ${x + rw} ${y + r}` +
    `V${y + rh - r}A${r} ${r} 0 0 1 ${x + rw - r} ${y + rh}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + rh - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/**
 * Dims everything but the "Every recipe" Photos section. Follows the section
 * every frame while it shows: the panel scrolls, and on a phone the sheet it
 * lives in is still sliding up when this mounts. Only re-renders when the
 * section actually moved.
 */
function Spotlight({ target, onDismiss }: { target: HTMLElement; onDismiss: () => void }) {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    let last = "";
    const follow = () => {
      const next = spotlightPath(target.getBoundingClientRect());
      if (next !== last) {
        last = next;
        setPath(next);
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!path) return null;
  return createPortal(
    <div
      className="recipe-photo-style-spotlight no-print"
      style={{ clipPath: `path(evenodd, "${path}")` }}
      onClick={onDismiss}
      aria-hidden
    />,
    document.body,
  );
}

/**
 * Shown under the "Every recipe" Photos tiles once a cook has set the same
 * layout on recipe after recipe from each page's own Photo dialog (see
 * lib/photoStyleStreak.ts). Everything but that section is dimmed, so the
 * tiles the copy talks about are the only thing lit. Clicking the dimmed part
 * is "Not now".
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
  const [section, setSection] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const found = ref.current?.closest<HTMLElement>("[data-photo-style-section]") ?? null;
    found?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setSection(found);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div ref={ref} className="recipe-photo-style-tip" role="note">
      {section && <Spotlight target={section} onDismiss={onDismiss} />}
      <p className="recipe-photo-style-tip__title">Change every recipe at once</p>
      <p className="recipe-photo-style-tip__body">
        {NOTICED[tip.mode]} These settings update the photo on every recipe in one go.
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
