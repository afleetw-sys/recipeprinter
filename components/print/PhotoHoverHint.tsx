"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, ICON_SIZE } from "@/components/icons";

/** Where a photo can be clicked: the page being worked on, not the rail's
    thumbnails or the pages around it. */
const ACTIVE_PAGE = ".recipe-page-slide.is-active, .recipe-spread__page.is-focused";

/** The only photo that gets the overlay: a recipe's in-page photo, small
    enough to read as part of the card rather than as something to click. A
    full-page photo, a chapter's and a cover's are the whole picture already
    (Amelia, 2026-11-04: it kept showing over them). */
const IN_PAGE_PHOTO = ".recipe-card__photo";

/**
 * "Change photo" over the photo under the mouse, so a photo reads as
 * something to click, not only as a hairline outline (Amelia, 2026-11-04).
 * Recipe cards and cookbooks alike, but only over a recipe's in-page photo on
 * the active page (`IN_PAGE_PHOTO`). A photo still waiting to be added says
 * "Add a photo" on itself, so it gets nothing here.
 *
 * One overlay for the whole deck, laid over the photo from outside the page.
 * The photos are a mix of <img>s (no ::after) and boxes whose ::after some
 * themes already draw on, and inside the page anything would scale with it.
 * It never takes the pointer, so the click still lands on the photo. Mouse
 * only: a touch has no hover, and the overlay would only flash under a tap.
 */
export function PhotoHoverHint({ surfaces }: { surfaces: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let current: Element | null = null;
    const hide = () => {
      current = null;
      setRect(null);
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.buttons !== 0) return;
      const target = event.target as Element | null;
      const surface = target?.closest?.(surfaces) ?? null;
      const photo =
        surface &&
        surface.matches(IN_PAGE_PHOTO) &&
        !surface.closest(".photo-placeholder") &&
        surface.closest(ACTIVE_PAGE)
          ? surface
          : null;
      if (photo === current) return;
      current = photo;
      setRect(photo ? photo.getBoundingClientRect() : null);
    };
    // A press may be a drag to reposition a full-page photo; the overlay
    // would sit over the picture being aimed. It comes back on the next move.
    const onDown = () => hide();
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", onDown);
    // The deck scrolls under a still mouse: the photo moves, the overlay
    // would not.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [surfaces]);

  if (!rect) return null;
  return createPortal(
    <div
      className="photo-hover-hint no-print"
      aria-hidden
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      <span className="photo-hover-hint__label">
        <ImageIcon size={ICON_SIZE.sm} />
        {/* Always a word: an in-page photo on a cookbook spread is ~40px at
            the deck's usual zoom, too small for an icon to say anything.
            There the pill is wider than the photo, which is fine. */}
        {rect.width >= 120 ? "Change photo" : "Change"}
      </span>
    </div>,
    document.body,
  );
}
