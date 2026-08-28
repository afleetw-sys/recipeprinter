"use client";

import { useEffect, useRef, useState } from "react";
import { ICON_SIZE, ImageIcon } from "@/components/icons";

type Option = { id: string; label: string; hint?: string };

/**
 * The photo placement control as it appears in the page toolbar.
 *
 * It used to be three buttons sitting open in the toolbar, and only while you
 * were editing the page. That is backwards on both counts: the control people
 * look for is "the photo", which should always be there, while None / In card /
 * Full page is the answer to a question they have not asked yet. So the toolbar
 * carries one image button, and the three placements live behind it.
 *
 * Deliberately the same picker/menu markup as "Move to another chapter" next to
 * it -- these are two toolbar buttons that open a menu, and they should not be
 * two different kinds of thing.
 */
export function PhotoPlacementPicker({
  options,
  active,
  onSelect,
  label = "Photo",
}: {
  options: Option[];
  active: string;
  onSelect: (id: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = options.find((option) => option.id === active);

  return (
    <div className="recipe-page-toolbar__picker recipe-page-toolbar__picker--start" ref={ref}>
      <button
        type="button"
        className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${open ? "is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The current placement is read out with the control, so the button is
        // not just "Photo" on a page that already has one somewhere specific.
        aria-label={current ? `${label}: ${current.label}` : label}
        title={current ? `${label}: ${current.label}` : label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((wasOpen) => !wasOpen);
        }}
      >
        <ImageIcon size={ICON_SIZE.md} />
      </button>
      {open && (
        <div className="recipe-page-toolbar__menu" role="menu" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === active}
              className={`recipe-page-toolbar__option ${option.id === active ? "is-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onSelect(option.id);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
