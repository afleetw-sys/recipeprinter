"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export type RailDragKind = "recipe" | "section";

/** Where a live drag would land: a viewport-space indicator line + the commit. */
export interface RailDropResolved {
  indicator: { top: number; left: number; width: number; height?: number };
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
): RailDragController {
  const [dragging, setDragging] = useState<{ id: string; kind: RailDragKind } | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const onBeginRef = useRef(onBegin);
  onBeginRef.current = onBegin;

  const gesture = useRef<Gesture | null>(null);
  const preview = useRef<HTMLElement | null>(null);
  const line = useRef<HTMLElement | null>(null);
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

    const refreshIndicator = (g: Gesture) => {
      const resolved = resolveRef.current(g.kind, g.id, g.x, g.y);
      const el = line.current;
      if (!el) return;
      if (resolved) {
        el.style.display = "block";
        el.style.top = `${resolved.indicator.top}px`;
        el.style.left = `${resolved.indicator.left}px`;
        el.style.width = `${resolved.indicator.width}px`;
        el.style.height = `${resolved.indicator.height ?? 3}px`;
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
      document.body.appendChild(clone);
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
      preview.current?.remove();
      preview.current = null;
      line.current?.remove();
      line.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      gesture.current = null;
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
      event.preventDefault();
    };

    const finish = (didCommit: boolean) => {
      const g = gesture.current;
      if (g?.active) {
        // Resolve the drop fresh at the final pointer position rather than
        // trusting the last animation frame — correct even if rAF was throttled
        // (background tab) or the release beat the next frame.
        if (didCommit) resolveRef.current(g.kind, g.id, g.x, g.y)?.commit();
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
