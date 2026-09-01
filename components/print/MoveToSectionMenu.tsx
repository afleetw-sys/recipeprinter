"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE, PlusIcon } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

/** A chapter a recipe can be moved into. */
export interface MoveToSectionOption {
  id: string;
  title?: string;
}

/**
 * The one menu for "move this recipe to another chapter".
 *
 * There used to be two, doing the same job with different shapes: the rail's
 * right-click menu (a pointer-anchored list headed by what it acts on) and the
 * page toolbar's own dropdown (an icon that opened a radio list, with the
 * current chapter shown disabled). Same recipes, same chapters, same result —
 * two menus to learn, and the toolbar's could not act on a multi-selection at
 * all, because only the rail knew there was one.
 *
 * The right-click menu won, so this is that menu. Callers decide what it acts
 * on and where it opens; everything else — the portal, staying on screen,
 * closing on an outside press, Escape, a scroll or a resize — lives here,
 * because those were the parts that had already drifted between the two.
 *
 * The word is "chapter", here and everywhere else in the product. The rail's
 * copy of this menu used to say "section" and the toolbar's said "chapter" —
 * one menu, one job, two nouns, decided by which control you happened to open
 * it from. Grouping is a cookbook feature (the headings only render in
 * organize mode, which is cookbook-only), a cookbook has chapters, and
 * "section" was only ever the name the CODE uses. It still is; nothing a
 * reader sees says it.
 */
export function MoveToSectionMenu({
  anchor,
  heading,
  sections,
  onMove,
  onNewSection,
  onClose,
}: {
  /** Viewport coordinates to open at: the pointer, or a trigger's corner. */
  anchor: { x: number; y: number };
  /** Names what the menu acts on, e.g. `Move “Guacamole” to`. */
  heading: string;
  /** Already filtered by the caller — a chapter with nowhere to move to is
      simply not passed. */
  sections: MoveToSectionOption[];
  onMove: (sectionId: string) => void;
  /** Omit to hide the "new chapter" row. */
  onNewSection?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // It opens at a point, so near the right or bottom edge it has to come back
  // inside once its real size is known.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8))}px`;
  }, [anchor]);

  useMenuDismiss(ref, onClose);

  return createPortal(
    <div
      ref={ref}
      className="cp-menu rail-tile-menu"
      role="menu"
      aria-label={heading}
      style={{ top: anchor.y, left: anchor.x }}
    >
      <p className="cp-menu__heading">{heading}</p>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          role="menuitem"
          className="cp-menu__item"
          onClick={() => {
            onMove(section.id);
            onClose();
          }}
        >
          {section.title?.trim() || "Untitled chapter"}
        </button>
      ))}
      {onNewSection && (
        <button
          type="button"
          role="menuitem"
          className="cp-menu__item cp-menu__item--make"
          onClick={() => {
            onNewSection();
            onClose();
          }}
        >
          <PlusIcon size={ICON_SIZE.sm} />
          New chapter
        </button>
      )}
    </div>,
    document.body,
  );
}
