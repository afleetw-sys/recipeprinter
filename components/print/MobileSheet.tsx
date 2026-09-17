"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "@/lib/useBackDismiss";
import { useModalFocus } from "@/lib/useModalFocus";
import { XIcon, ICON_SIZE } from "@/components/icons";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Defaults to `title` when it's a plain string. Required when `title` isn't. */
  ariaLabel?: string;
  footer?: ReactNode;
  /** Extra class(es) on the sheet element itself, for a caller's own content-scoped rules. */
  className?: string;
  /** Render into `document.body` instead of wherever this is called from.
      Every existing caller (Size, Book, Themes) is a direct child of the
      page's own top-level return, which the class doc below already leans
      on: `position: fixed` targets the viewport there. A caller mounted
      deep inside the deck (the per-page photo toolbar, which sits under the
      scaled/zoomed print preview) doesn't get that for free — a `transform`
      anywhere in that ancestry makes ITSELF the containing block for a
      `position: fixed` descendant, so the sheet ends up sized and placed
      relative to some card preview instead of the screen. Off by default so
      every existing caller's render tree is untouched. */
  portal?: boolean;
  children: ReactNode;
}

/**
 * The one bottom-sheet shell every mobile tool bar button opens: Book, Size,
 * Print settings. Each used to build its own version — a plain fixed popover
 * with no animation for Size and Settings, a proper sliding sheet only for
 * Book — so they read as three different surfaces instead of one interaction.
 * Nested inside `.recipe-mobile-topbar` (its own stacking context), the
 * Settings menu also render *behind* the bottom action bar despite its own
 * higher z-index — a z-index only wins against siblings in the same stacking
 * context, and the topbar's is capped well below the action bar's. Rendering
 * every sheet as a sibling at the top of the page, through this one
 * component, is what keeps that from happening again: there is nowhere left
 * for a sheet to be nested that would cap it.
 */
export function MobileSheet({
  open,
  onClose,
  title,
  subtitle,
  ariaLabel,
  footer,
  className,
  portal = false,
  children,
}: MobileSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useModalFocus(sheetRef, close, { disabled: !open });
  useBackDismiss(open, close);

  // Portals need a real DOM to target, which doesn't exist during SSR or the
  // first hydration pass — same reasoning as Dialog's own `mounted` gate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const resolvedLabel = ariaLabel ?? (typeof title === "string" ? title : undefined);

  const sheet = (
    <>
      {open && (
        <button
          type="button"
          className="recipe-mobile-sheet__backdrop no-print"
          aria-label={resolvedLabel ? `Close ${resolvedLabel.toLowerCase()}` : "Close"}
          onClick={onClose}
        />
      )}
      <aside
        ref={sheetRef}
        className={`recipe-mobile-sheet no-print ${open ? "is-open" : ""} ${className ?? ""}`}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label={resolvedLabel}
        aria-hidden={open ? undefined : "true"}
        /* Focusable only while it is a dialog, so the focus trap has somewhere
           to land in a sheet whose controls are all scrolled out of reach. */
        tabIndex={open ? -1 : undefined}
      >
        <div className="recipe-mobile-sheet__grabber" aria-hidden />
        <header className="recipe-mobile-sheet__header">
          <div>
            <h2>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" className="icon-close-btn" aria-label="Close" onClick={onClose}>
            <XIcon size={ICON_SIZE.md} />
          </button>
        </header>
        <div className="recipe-mobile-sheet__scroll">{children}</div>
        {footer && <footer className="recipe-mobile-sheet__footer">{footer}</footer>}
      </aside>
    </>
  );

  if (!portal) return sheet;
  return mounted ? createPortal(sheet, document.body) : null;
}
