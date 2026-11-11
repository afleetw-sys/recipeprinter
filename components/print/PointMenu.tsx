"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

export interface PointMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * A menu that opens where a finger long-pressed (lib/useLongPress), the
 * phone's stand-in for a right-click menu. The same look and edge-keeping as
 * MoveToSectionMenu, for a short list of actions.
 */
export function PointMenu({
  anchor,
  heading,
  items,
  onClose,
}: {
  anchor: { x: number; y: number };
  heading: string;
  items: PointMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
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
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={`cp-menu__item ${item.danger ? "cp-menu__item--danger" : ""}`}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
