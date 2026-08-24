"use client";

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, ICON_SIZE } from "@/components/icons";

// `variant` (not `size` — that's a native <select> attribute) picks the field
// height: "compact" is the 38px print-panel dropdown, "default" the 48px field.
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: "default" | "compact";
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", variant = "default", ...props },
  ref,
) {
  const variantClass = variant === "compact" ? "field--compact" : "";
  return (
    <div className="select-shell">
      <select
        ref={ref}
        className={`select-shell__control ${className} ${variantClass}`.trim()}
        {...props}
      />
      <ChevronDownIcon size={ICON_SIZE.sm} className="select-shell__caret" />
    </div>
  );
});

/**
 * A single-choice dropdown drawn by us, rather than by the OS.
 *
 * `Select` above is a native `<select>` in a shell: it takes our chevron and
 * our field box, but the list it opens is the operating system's, which cannot
 * be styled, cannot show a second line, and looks nothing like the menus this
 * workspace opens everywhere else (the rail's Add overflow, the header's kind
 * chip). Two costs followed from that. The visible one is that the same
 * gesture produced a different-looking list depending on which control you
 * used. The concrete one is that the size options each carry a `detail` —
 * "Letter paper", "Landscape recipe card" — that a native option element has
 * nowhere to put, so the app was holding an explanation it could not show.
 *
 * Portalled to the body and placed by hand: this lives inside the settings
 * panel, which is its own scroll container, so an absolutely-positioned menu
 * would be clipped at the panel's edge. Same treatment as the rail's overflow.
 */
export function SelectMenu<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id?: string;
  /** Names the list for a screen reader — the visible label is the field's own. */
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string; detail?: string }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((option) => option.id === value);

  // Under the trigger, matched to its width, clamped into the viewport, and
  // re-placed on scroll/resize so it tracks the field it belongs to.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      if (!panel || !trigger) return;
      const t = trigger.getBoundingClientRect();
      panel.style.width = `${t.width}px`;
      const h = panel.getBoundingClientRect().height;
      panel.style.left = `${Math.max(8, Math.min(t.left, window.innerWidth - t.width - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(t.bottom + 6, window.innerHeight - h - 8))}px`;
    }
    place();
    // Focus starts on the current choice, so a keyboard arrow moves relative to
    // where you already are rather than from the top of the list.
    panelRef.current?.querySelector<HTMLElement>(".select-menu__option.is-active")?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(".select-menu__option") ?? [],
      );
      if (!items.length) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length].focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="field field--compact select-menu__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="select-menu__value">{current?.label ?? ""}</span>
        <ChevronDownIcon size={ICON_SIZE.sm} className="select-menu__caret" />
      </button>

      {open &&
        createPortal(
          <div ref={panelRef} className="select-menu__panel" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                className={`select-menu__option ${option.id === value ? "is-active" : ""}`}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  if (option.id !== value) onChange(option.id);
                }}
              >
                <span className="select-menu__option-name">{option.label}</span>
                {option.detail && (
                  <span className="select-menu__option-note">{option.detail}</span>
                )}
                {option.id === value && (
                  <CheckIcon size={ICON_SIZE.xs} className="select-menu__check" />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
