"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "@/components/Controls";
import { ICON_SIZE, XIcon } from "@/components/icons";
import type { PhotoStyle } from "@/lib/project";

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
/** From the opening's edge to the tooltip, room for its arrow. */
const TOOLTIP_GAP = 12;
/** Closest the tooltip comes to the edge of the screen. */
const EDGE = 12;
/** How close the arrow may come to a corner of the tooltip. */
const ARROW_INSET = 18;

type Side = "left" | "top" | "bottom";

interface Layout {
  path: string;
  side: Side;
  top: number;
  left: number;
  /** Along the tooltip's edge, where the arrow sits, so it points at the
      middle of the section even when the tooltip is pushed off-centre. */
  arrow: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

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
 * Where the tooltip goes: beside the section when there is room to its left
 * (the desktop panel, on the right edge of the screen), otherwise above it (a
 * phone's sheet, at the bottom), otherwise below.
 */
function tooltipLayout(rect: DOMRect, tooltip: { width: number; height: number }): Omit<Layout, "path"> {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const offset = SPOTLIGHT_PAD + TOOLTIP_GAP;
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;

  if (rect.left - offset - tooltip.width >= EDGE) {
    const top = clamp(midY - tooltip.height / 2, EDGE, h - tooltip.height - EDGE);
    return {
      side: "left",
      left: rect.left - offset - tooltip.width,
      top,
      arrow: clamp(midY - top, ARROW_INSET, tooltip.height - ARROW_INSET),
    };
  }
  const left = clamp(midX - tooltip.width / 2, EDGE, w - tooltip.width - EDGE);
  const arrow = clamp(midX - left, ARROW_INSET, tooltip.width - ARROW_INSET);
  if (rect.top - offset - tooltip.height >= EDGE) {
    return { side: "top", top: rect.top - offset - tooltip.height, left, arrow };
  }
  return { side: "bottom", top: rect.bottom + offset, left, arrow };
}

/**
 * Dims everything but the "Every recipe" Photos section and floats the tip
 * beside it, pointing at it. Follows the section every frame while it shows:
 * the panel scrolls, and on a phone the sheet it lives in is still sliding up
 * when this mounts. Only re-renders when something actually moved.
 */
function SpotlightTooltip({ target, onDismiss }: { target: HTMLElement; onDismiss: () => void }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    let frame = 0;
    let last = "";
    const follow = () => {
      const rect = target.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      const next: Layout = {
        path: spotlightPath(rect),
        ...tooltipLayout(rect, {
          width: tooltip?.offsetWidth ?? 0,
          height: tooltip?.offsetHeight ?? 0,
        }),
      };
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setLayout(next);
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return createPortal(
    <>
      {layout && (
        <div
          className="recipe-photo-style-spotlight no-print"
          style={{ clipPath: `path(evenodd, "${layout.path}")` }}
          onClick={onDismiss}
          aria-hidden
        />
      )}
      <div
        ref={tooltipRef}
        className={`recipe-photo-style-tooltip recipe-photo-style-tooltip--${layout?.side ?? "left"} no-print`}
        role="dialog"
        aria-labelledby="photo-style-tooltip-title"
        style={{
          top: layout?.top ?? 0,
          left: layout?.left ?? 0,
          // Measured before it is placed, so it stays invisible for that
          // first frame rather than flashing in the corner.
          visibility: layout ? "visible" : "hidden",
          ["--arrow" as string]: `${layout?.arrow ?? 0}px`,
        }}
      >
        <div className="recipe-photo-style-tooltip__head">
          <p id="photo-style-tooltip-title" className="recipe-photo-style-tooltip__title">
            Change every recipe at once
          </p>
          <IconButton className="icon-button--compact icon-button--bare" onClick={onDismiss} aria-label="Close">
            <XIcon size={ICON_SIZE.sm} />
          </IconButton>
        </div>
        <p className="recipe-photo-style-tooltip__body">
          These settings update the photo on every recipe in one go.
        </p>
      </div>
    </>,
    document.body,
  );
}

/**
 * Mounted inside the "Every recipe" Photos section once a cook has set the
 * same layout on recipe after recipe from each page's own Photo dialog (see
 * lib/photoStyleStreak.ts). Takes no room there itself: it only finds the
 * section, then dims everything else and floats the tip beside it. The tiles
 * in the section are the answer; closing, Escape, or a click on the dimmed
 * part is "not now".
 */
export function PhotoStyleTip({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
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
    <span ref={ref} hidden>
      {section && <SpotlightTooltip target={section} onDismiss={onDismiss} />}
    </span>
  );
}
