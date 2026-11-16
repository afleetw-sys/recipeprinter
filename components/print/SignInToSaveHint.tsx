"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE, XIcon } from "@/components/icons";

/* Dismissed once, gone for good in this browser. A failed read shows it again,
   which is the safe side: it's a hint, not a nag. */
const STORAGE_KEY = "rp.signInToSaveHintDismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The avatar on screen right now: the header's on desktop, the top bar's on a phone. */
function visibleAvatar(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-rp-avatar]"));
  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

interface Placement {
  top: number;
  right: number;
  arrowRight: number;
}

/**
 * A small pointer at the account avatar for a signed-out cook whose cookbook is
 * growing: until they sign in, the book lives only in this browser tab. Seen in
 * a replay (2026-11-14): a cook started a book on an iPad, came back on a laptop
 * hours later, and could not find it anywhere.
 *
 * The page decides WHEN (`show`); this owns where it sits and remembering that
 * it was dismissed.
 */
export function SignInToSaveHint({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const visible = show && !dismissed;

  useLayoutEffect(() => {
    if (!visible) {
      setPlacement(null);
      return;
    }
    const place = () => {
      const avatar = visibleAvatar();
      if (!avatar) {
        setPlacement(null);
        return;
      }
      const rect = avatar.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const center = rect.left + rect.width / 2;
      // The card's right edge sits a little past the avatar, never off screen.
      const right = Math.max(12, viewport - center - 24);
      setPlacement({ top: rect.bottom + 10, right, arrowRight: viewport - right - center });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      observer.disconnect();
    };
  }, [visible]);

  if (!visible || !placement) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Gone for this page only.
    }
  }

  return createPortal(
    <div
      role="status"
      className="rp-signin-hint"
      style={{ top: placement.top, right: placement.right }}
    >
      <span
        className="rp-signin-hint__arrow"
        aria-hidden
        style={{ right: `calc(${placement.arrowRight}px - 6px)` }}
      />
      <p className="rp-signin-hint__text">
        <strong>Sign in to save your cookbook.</strong> Then you can pick it up on any device.
      </p>
      <button type="button" className="rp-signin-hint__close" aria-label="Dismiss" onClick={dismiss}>
        <XIcon size={ICON_SIZE.sm} />
      </button>
    </div>,
    document.body,
  );
}
