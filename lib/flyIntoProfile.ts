"use client";

/** A rectangle, as `getBoundingClientRect` gives it. */
export interface FlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How far, and how much smaller, to send the clone.
 *
 * Pure, exported and tested, because the DOM half of this file cannot be: the
 * animation needs real layout, and every rect in a headless run measures zero.
 * The arithmetic is where the mistakes live anyway — the first version of this
 * subtracted the source's own offset twice, which flew the page off to the left
 * of the avatar by however far down the page it happened to sit, and looked
 * exactly like "the animation is broken" rather than like a sign error.
 *
 * The clone is positioned at the source's own coordinates with a top-left
 * transform origin, so a point (x, y) inside it lands at
 * `from.left + dx + x * scale`. Setting that equal to the target's centre for
 * the clone's centre gives the vector below.
 */
export function flightVector(from: FlightRect, to: FlightRect) {
  // Never quite to nothing: a page that vanishes before it arrives reads as a
  // glitch rather than as something being put away.
  const scale = Math.max(to.width / from.width, 0.04);
  return {
    scale,
    dx: to.left + to.width / 2 - from.left - (from.width * scale) / 2,
    dy: to.top + to.height / 2 - from.top - (from.height * scale) / 2,
  };
}

/** Where the saved thing lands. Set by the header's account control. */
const AVATAR_SELECTOR = "[data-rp-avatar]";

/** Long enough to read as a movement, short enough not to delay leaving. */
const FLIGHT_MS = 460;

/**
 * Send the open project into the profile, visibly.
 *
 * Leaving the workspace files what you were working on and clears the desk.
 * That used to be explained afterwards, by a line on the homepage saying the
 * book "is saved in your projects" — an answer to a question the cook had
 * already been made to ask. Showing the thing travel answers it before it is
 * asked, and it teaches where saved work lives, which the sentence never did.
 *
 * A clone flies rather than the element itself: the real page is inside a
 * scrolling deck with clipped ancestors, and a `position: fixed` copy is the
 * only way to cross those bounds. The original is left alone because the whole
 * screen is about to be replaced anyway.
 *
 * Resolves when the flight is over — or immediately when there is nothing to
 * animate, no avatar on screen, or the reader has asked for reduced motion.
 * Callers await it before navigating, so this is deliberately allowed to give
 * up rather than to fail: a save must never wait on a decoration.
 */
export function flyIntoProfile(source: HTMLElement | null): Promise<void> {
  if (typeof window === "undefined" || !source) return Promise.resolve();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  const target = document.querySelector(AVATAR_SELECTOR);
  if (!target) return Promise.resolve();

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width <= 0 || from.height <= 0 || to.width <= 0) return Promise.resolve();

  const clone = source.cloneNode(true) as HTMLElement;
  // Any id inside a clone is a duplicate id in the document until it is
  // removed, which breaks label/aria references on the real element beneath.
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    zIndex: "200",
    pointerEvents: "none",
    transformOrigin: "top left",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(clone);

  const { dx, dy, scale } = flightVector(from, to);

  const flight = clone.animate(
    [
      { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        opacity: 0.15,
      },
    ],
    { duration: FLIGHT_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
  );

  // A small acknowledgement at the destination, so the arrival lands on
  // something rather than just stopping.
  target.animate?.(
    [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
    { duration: 260, delay: FLIGHT_MS - 160, easing: "ease-out" },
  );

  return flight.finished
    .catch(() => undefined)
    .then(() => {
      clone.remove();
    });
}

/**
 * The sheet the reader is actually looking at.
 *
 * The deck only draws a window of pages around the current one, and it scrolls,
 * so neither "the first page in the DOM" nor "page one" is reliably the one on
 * screen. Picking the sheet nearest the middle of the viewport is what makes
 * the flight start from the page the cook was just reading rather than from
 * somewhere off-screen.
 */
export function visibleDeckPage(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".recipe-page-scaler"));
  if (pages.length === 0) return null;
  const middle = window.innerHeight / 2;
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const page of pages) {
    const rect = page.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const distance = Math.abs(rect.top + rect.height / 2 - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = page;
    }
  }
  return best;
}
