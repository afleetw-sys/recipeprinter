"use client";

import { useCallback, useRef, type MouseEvent, type TouchEvent } from "react";

/** How long a finger rests before it's a long press, not a tap. */
const HOLD_MS = 500;
/** How far it can drift and still be a press rather than the start of a scroll. */
const SLOP_PX = 10;

function inTextField(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

/**
 * A long press on a touch screen does what a right-click does with a mouse
 * (Amelia, 2026-11-10): the same menu, at the finger.
 *
 * iOS Safari never sends `contextmenu` for a long press, so it is timed here
 * from the touch itself. Android Chrome does send one, and a mouse sends one
 * on right-click; both arrive through `onContextMenu`, and whichever comes
 * first opens the menu once. Any movement past a few pixels is a scroll and
 * cancels it. The tap that ends a timed long press is swallowed, so letting go
 * doesn't also open what was pressed.
 *
 * One finger at a time, so one hook serves a whole list: `bind(key)` gives a
 * row its handlers, and the callback is told which row it was. Give the rows
 * `.rp-long-press` so iOS doesn't put its own copy/select callout over the
 * menu.
 */
export function useLongPress<K>(onLongPress: (point: { x: number; y: number }, key: K) => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number; key: K } | null>(null);
  const swallowClick = useRef(false);
  const handler = useRef(onLongPress);
  handler.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  const bind = useCallback(
    (key: K) => ({
      onTouchStart: (event: TouchEvent) => {
        cancel();
        swallowClick.current = false;
        // In a text field a long press is the field's (select, paste), as a
        // right-click there is on desktop.
        if (event.touches.length !== 1 || inTextField(event.target)) return;
        const touch = event.touches[0];
        start.current = { x: touch.clientX, y: touch.clientY, key };
        timer.current = window.setTimeout(() => {
          const pressed = start.current;
          cancel();
          if (!pressed) return;
          swallowClick.current = true;
          handler.current({ x: pressed.x, y: pressed.y }, pressed.key);
        }, HOLD_MS);
      },
      onTouchMove: (event: TouchEvent) => {
        const from = start.current;
        const touch = event.touches[0];
        if (!from || !touch) return;
        if (Math.hypot(touch.clientX - from.x, touch.clientY - from.y) > SLOP_PX) cancel();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      onContextMenu: (event: MouseEvent) => {
        if (inTextField(event.target)) return;
        event.preventDefault();
        // The timer already opened it (Android sends both).
        if (swallowClick.current) return;
        cancel();
        handler.current({ x: event.clientX, y: event.clientY }, key);
      },
      onClickCapture: (event: MouseEvent) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    }),
    [cancel],
  );

  return bind;
}
