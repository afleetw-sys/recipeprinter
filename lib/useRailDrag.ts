"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export type RailDragKind = "recipe" | "section";

/** Where a live drag would land: a viewport-space indicator line + the commit. */
export interface RailDropResolved {
  /** `box` outlines the area instead of drawing a line: a whole target, like
      a folded chapter's bar. */
  indicator: { top: number; left: number; width: number; height?: number; box?: boolean };
  /** The organizer's grid opens an empty tile-sized slot where the card will
      land instead of drawing a line, and the other cards move aside for it,
      the way a phone's home screen does: placed before or after the element
      `anchor` (a selector inside the rail) selects. */
  slot?: { anchor: string; place: "before" | "after" };
  commit: () => void;
}

export interface RailDragController {
  /** id of the row being dragged right now (for dimming the source), or null. */
  draggingId: string | null;
  /** Kind of the active drag, or null. */
  draggingKind: RailDragKind | null;
  /** Call on a handle's pointerdown to arm a potential drag. */
  start: (event: ReactPointerEvent, kind: RailDragKind, id: string) => void;
  /** True if the last pointer sequence became a drag — a click handler can bail. */
  didDrag: () => boolean;
}

// Movement (px) before a press becomes a drag rather than a click.
const DRAG_THRESHOLD = 6;
// How far (px) the pointer has to move before the drop target is worked out
// again. Opening the slot moves the cards under a pointer that has not moved,
// and asking afresh then could name the place the slot just left, so the slot
// flickered between two places on its own.
const RESOLVE_MOVE = 4;
// Distance from the scroll container's edge that triggers auto-scroll, and the
// per-frame scroll speed at the very edge.
const EDGE = 48;
const MAX_SCROLL_SPEED = 14;

interface Gesture {
  pointerId: number;
  kind: RailDragKind;
  id: string;
  startX: number;
  startY: number;
  grabDX: number;
  grabDY: number;
  node: HTMLElement;
  active: boolean;
  x: number;
  y: number;
}

/**
 * Pointer-based drag-to-reorder for the page rail. Deliberately imperative for
 * smoothness: the floating preview and the drop-indicator line are real DOM
 * nodes this hook creates, positions, and removes itself, so a drag causes ZERO
 * React re-renders between grab and drop (only the source's dimming toggles).
 *
 * The window pointer listeners are attached ONCE (on mount) and always read the
 * live gesture ref, so there is no per-drag add/remove churn (and no stale
 * handler identity — the mid-drag re-render that dims the source would otherwise
 * break a removeEventListener). The rail owns the meaning of a drop: it passes
 * `resolve`, which measures its own rows and returns the indicator position + a
 * commit thunk (or null when the pointer isn't over a valid target).
 */
export function useRailDrag(
  scrollRef: RefObject<HTMLElement | null>,
  resolve: (kind: RailDragKind, id: string, clientX: number, clientY: number) => RailDropResolved | null,
  onBegin?: (kind: RailDragKind, id: string) => void,
  /** How many rows this drag actually carries (a multi-select drags them all).
      Anything above one gets a count badge on the preview, so the cook can see
      the drag is bigger than the single card under the pointer. */
  countFor?: (kind: RailDragKind, id: string) => number,
  /** The rail's own layout moved (the drop slot opened somewhere new), so any
      cached measurements of its rows are stale. */
  onLayoutChange?: () => void,
): RailDragController {
  const [dragging, setDragging] = useState<{ id: string; kind: RailDragKind } | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const onBeginRef = useRef(onBegin);
  onBeginRef.current = onBegin;
  const countForRef = useRef(countFor);
  countForRef.current = countFor;
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const gesture = useRef<Gesture | null>(null);
  const preview = useRef<HTMLElement | null>(null);
  const line = useRef<HTMLElement | null>(null);
  // The organizer's drop slot, and the carried card it stands in for (hidden
  // while the slot shows, so the grid closes up behind it).
  const slot = useRef<HTMLElement | null>(null);
  const hiddenSource = useRef<HTMLElement | null>(null);
  const settleTimer = useRef<number | null>(null);
  // What the slot was opened for, which a pointer resting on the slot keeps.
  const lastResolved = useRef<RailDropResolved | null>(null);
  // Where the pointer was, and the rail's scroll, when `lastResolved` was asked.
  const lastResolvedAt = useRef<{ x: number; y: number; scrollTop: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    const applyPreview = (g: Gesture) => {
      if (preview.current) {
        preview.current.style.transform = `translate3d(${g.x - g.grabDX}px, ${g.y - g.grabDY}px, 0) scale(1.03)`;
      }
    };

    const autoScroll = (g: Gesture) => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const box = scroller.getBoundingClientRect();
      if (g.y < box.top + EDGE) {
        scroller.scrollTop -= Math.min(MAX_SCROLL_SPEED, (MAX_SCROLL_SPEED * (box.top + EDGE - g.y)) / EDGE);
      } else if (g.y > box.bottom - EDGE) {
        scroller.scrollTop += Math.min(MAX_SCROLL_SPEED, (MAX_SCROLL_SPEED * (g.y - (box.bottom - EDGE))) / EDGE);
      }
    };

    /**
     * Open the drop slot where the card will land, and slide the cards it
     * displaces to their new places rather than letting them jump (FLIP: note
     * where every card is, move the slot, then play each card from its old
     * place to its new one). The rail's measurements are only marked stale
     * once the cards have settled, so the drop target is still worked out
     * against the layout the pointer was aimed at while they move.
     */
    const placeSlot = (g: Gesture, target: NonNullable<RailDropResolved["slot"]>) => {
      const scroller = scrollRef.current;
      // A card sits in its rail row (`data-rail-kind`), and the row is what
      // the grid lays out, so the slot goes beside rows and the carried card's
      // row is what hides.
      const found = scroller?.querySelector<HTMLElement>(target.anchor);
      const anchor = found?.closest<HTMLElement>("[data-rail-kind]") ?? found;
      const source = g.node.closest<HTMLElement>("[data-rail-kind]") ?? g.node;
      if (!scroller || !anchor?.parentNode) return false;
      let el = slot.current;
      if (!el) {
        el = document.createElement("div");
        el.className = "rail-drop-slot";
        el.setAttribute("aria-hidden", "true");
        el.style.height = `${g.node.getBoundingClientRect().height}px`;
        slot.current = el;
      }
      const already =
        target.place === "before"
          ? el.nextElementSibling === anchor && el.parentNode === anchor.parentNode
          : el.previousElementSibling === anchor && el.parentNode === anchor.parentNode;
      if (already) return true;

      const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // The cards themselves, not their rows: a row is only a wrapper
      // (`display: contents` in the organizer), with no box to slide.
      const cards = animate
        ? Array.from(
            scroller.querySelectorAll<HTMLElement>(
              "[data-rail-recipe], [data-rail-section-head], [data-rail-section-add]",
            ),
          ).filter((card) => !source.contains(card))
        : [];
      const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));

      if (!hiddenSource.current && source.isConnected) {
        source.style.display = "none";
        hiddenSource.current = source;
      }
      anchor.parentNode.insertBefore(el, target.place === "before" ? anchor : anchor.nextSibling);

      for (const card of cards) {
        const from = before.get(card);
        if (!from) continue;
        const to = card.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (!dx && !dy) continue;
        card.style.transition = "none";
        card.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          card.style.transition = "transform 70ms ease-out";
          card.style.transform = "";
        });
      }
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(
        () => {
          settleTimer.current = null;
          for (const card of cards) card.style.transition = "";
          onLayoutChangeRef.current?.();
        },
        animate ? 75 : 0,
      );
      return true;
    };

    /** The pointer is on the open slot: that is where the card goes, and the
        slot must not move out from under it. Opening the slot shifts the cards
        around it, so asking afresh from there can name a neighbour instead,
        and the slot then jumped back and forth between two places. */
    const overSlot = (g: Gesture) => {
      const rect = slot.current?.isConnected ? slot.current.getBoundingClientRect() : null;
      return Boolean(rect && g.x >= rect.left && g.x <= rect.right && g.y >= rect.top && g.y <= rect.bottom);
    };

    const resolveAt = (g: Gesture) => {
      if (lastResolved.current?.slot && overSlot(g)) return lastResolved.current;
      // A still hand keeps its answer: only the pointer moving, or the rail
      // scrolling under it, is a reason for the slot to move.
      const at = lastResolvedAt.current;
      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      if (
        lastResolved.current &&
        at &&
        at.scrollTop === scrollTop &&
        Math.hypot(g.x - at.x, g.y - at.y) < RESOLVE_MOVE
      ) {
        return lastResolved.current;
      }
      const resolved = resolveRef.current(g.kind, g.id, g.x, g.y);
      lastResolved.current = resolved;
      lastResolvedAt.current = { x: g.x, y: g.y, scrollTop };
      return resolved;
    };

    const refreshIndicator = (g: Gesture) => {
      const resolved = resolveAt(g);
      const el = line.current;
      if (!el) return;
      if (resolved?.slot && placeSlot(g, resolved.slot)) {
        el.style.display = "none";
        return;
      }
      // A whole target (a folded chapter) is outlined, not opened, so a gap
      // left open elsewhere closes and the carried card shows in its place.
      if (resolved?.indicator.box && slot.current) {
        slot.current.remove();
        slot.current = null;
        if (hiddenSource.current) {
          hiddenSource.current.style.display = "";
          hiddenSource.current = null;
        }
        onLayoutChangeRef.current?.();
      }
      if (resolved) {
        el.style.display = "block";
        el.style.top = `${resolved.indicator.top}px`;
        el.style.left = `${resolved.indicator.left}px`;
        el.style.width = `${resolved.indicator.width}px`;
        el.style.height = `${resolved.indicator.height ?? 3}px`;
        el.classList.toggle("rail-drop-line--box", Boolean(resolved.indicator.box));
      } else {
        el.style.display = "none";
      }
    };

    // The per-frame loop keeps the preview under the pointer and re-resolves the
    // drop target as auto-scroll shifts the rows beneath it.
    const tick = () => {
      const g = gesture.current;
      if (!g || !g.active) return;
      applyPreview(g);
      autoScroll(g);
      refreshIndicator(g);
      rafId.current = requestAnimationFrame(tick);
    };

    const begin = (g: Gesture) => {
      g.active = true;
      didDragRef.current = true;
      onBeginRef.current?.(g.kind, g.id);
      const rect = g.node.getBoundingClientRect();
      const clone = g.node.cloneNode(true) as HTMLElement;
      clone.classList.add("rail-drag-preview");
      Object.assign(clone.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: `${rect.width}px`,
        margin: "0",
        pointerEvents: "none",
        zIndex: "1000",
        transform: `translate3d(${g.x - g.grabDX}px, ${g.y - g.grabDY}px, 0) scale(1.03)`,
      });
      const count = countForRef.current?.(g.kind, g.id) ?? 1;
      if (count > 1) {
        const badge = document.createElement("span");
        badge.className = "rail-drag-preview__count";
        badge.textContent = String(count);
        clone.appendChild(badge);
      }
      // The copy goes on <body>, outside the organizer whose rules lay a card
      // out (number, photo, title in a row). Inside a frame carrying the
      // organizer's class it keeps that layout instead of falling back to the
      // page rail's, which stacked the photo above the title.
      if (g.node.closest(".recipe-print-shell--organizing")) {
        const frame = document.createElement("div");
        frame.className = "recipe-print-shell--organizing rail-drag-preview-frame";
        frame.appendChild(clone);
        document.body.appendChild(frame);
      } else {
        document.body.appendChild(clone);
      }
      preview.current = clone;

      const indicator = document.createElement("div");
      indicator.className = "rail-drop-line";
      Object.assign(indicator.style, {
        position: "fixed",
        display: "none",
        zIndex: "1000",
        pointerEvents: "none",
      });
      document.body.appendChild(indicator);
      line.current = indicator;

      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      setDragging({ id: g.id, kind: g.kind });
      rafId.current = requestAnimationFrame(tick);
    };

    const teardown = () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      const frame = preview.current?.parentElement;
      (frame?.classList.contains("rail-drag-preview-frame") ? frame : preview.current)?.remove();
      preview.current = null;
      line.current?.remove();
      line.current = null;
      // Out of the rail before anything re-renders it: the slot is not one of
      // React's nodes, and the carried card goes back to being drawn.
      if (slot.current) {
        slot.current.remove();
        slot.current = null;
        onLayoutChangeRef.current?.();
      }
      if (hiddenSource.current) {
        hiddenSource.current.style.display = "";
        hiddenSource.current = null;
      }
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      // And no card left mid-slide.
      scrollRef.current
        ?.querySelectorAll<HTMLElement>("[data-rail-recipe], [data-rail-section-head], [data-rail-section-add]")
        .forEach((card) => {
          card.style.transform = "";
          card.style.transition = "";
        });
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      gesture.current = null;
      lastResolved.current = null;
      lastResolvedAt.current = null;
    };

    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.x = event.clientX;
      g.y = event.clientY;
      if (!g.active) {
        if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < DRAG_THRESHOLD) return;
        begin(g);
      }
      // The carried card follows the pointer from the event itself, not the
      // next animation frame, which left it trailing a frame behind the hand.
      applyPreview(g);
      event.preventDefault();
    };

    const finish = (didCommit: boolean) => {
      const g = gesture.current;
      if (g?.active) {
        // Resolve the drop at the final pointer position rather than trusting
        // the last animation frame (correct even if rAF was throttled or the
        // release beat the next frame), or the open slot if the pointer is on
        // it, so the card lands where the slot showed. Resolved before
        // the teardown, against the layout the cook let go over, and committed
        // after it, so the move re-renders a rail with no slot left in it.
        const resolved = didCommit ? resolveAt(g) : null;
        teardown();
        resolved?.commit();
        setDragging(null);
        // Keep didDrag true through the click that fires right after pointerup,
        // then clear it so a later real click isn't swallowed.
        setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      } else {
        didDragRef.current = false;
      }
      teardown();
    };

    const onUp = (event: PointerEvent) => {
      if (gesture.current && event.pointerId === gesture.current.pointerId) finish(true);
    };
    const onCancel = () => finish(false);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      teardown();
    };
  }, [scrollRef]);

  const start = (event: ReactPointerEvent, kind: RailDragKind, id: string) => {
    // Left button / touch / pen only, and don't hijack a drag already running.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (gesture.current) return;
    // A recipe drags its own card; a section drags its whole group block.
    const selector = kind === "section" ? "[data-rail-section]" : "[data-rail-recipe]";
    const node = (event.currentTarget as HTMLElement).closest<HTMLElement>(selector);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    gesture.current = {
      pointerId: event.pointerId,
      kind,
      id,
      startX: event.clientX,
      startY: event.clientY,
      grabDX: event.clientX - rect.left,
      grabDY: event.clientY - rect.top,
      node,
      active: false,
      x: event.clientX,
      y: event.clientY,
    };
  };

  return {
    draggingId: dragging?.id ?? null,
    draggingKind: dragging?.kind ?? null,
    start,
    didDrag: () => didDragRef.current,
  };
}
