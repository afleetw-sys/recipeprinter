"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { BookIcon, ChevronDownIcon, ICON_SIZE, PlusIcon } from "@/components/icons";

/** Where a chapter's recipes come from: a new import, or the book itself. */
export type ChapterAddFrom = "new" | "book";

const LABEL: Record<ChapterAddFrom, string> = {
  new: "Add new",
  book: "Add existing",
};

/* The last one used, for every chapter at once, so it stays put while a cook
   works down a book filling chapters the same way. Kept per browser, like the
   Print button's remembered format; a failed read is just the default. */
const STORAGE_KEY = "rp.chapterAddFrom";
let current: ChapterAddFrom = "new";
let loaded = false;
const listeners = new Set<() => void>();

function read(): ChapterAddFrom {
  if (!loaded) {
    loaded = true;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "book") current = "book";
    } catch {
      // Private window or blocked storage: the default stands.
    }
  }
  return current;
}

function remember(next: ChapterAddFrom) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Remembered for this page only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A chapter's Add button, split the way Print and Download are.
 *
 * The main half does whichever of "Add new" and "Add existing" was used
 * last; the arrow offers the other, and choosing it there makes it the main
 * half from then on. With nothing elsewhere in the book to bring in, it is a
 * plain Add new button: an arrow onto an empty list is a dead end.
 */
export function ChapterAddSplit({
  onAdd,
  canPickFromBook,
}: {
  onAdd: (from: ChapterAddFrom) => void;
  /** Some recipe in the book sits outside this chapter. */
  canPickFromBook: boolean;
}) {
  const remembered = useSyncExternalStore(subscribe, read, () => "new" as const);
  const primary: ChapterAddFrom = canPickFromBook ? remembered : "new";
  const other: ChapterAddFrom = primary === "new" ? "book" : "new";
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const Icon = (from: ChapterAddFrom) => (from === "new" ? PlusIcon : BookIcon);
  const PrimaryIcon = Icon(primary);
  const OtherIcon = Icon(other);

  return (
    <span
      className="recipe-print-split recipe-page-rail__section-add"
      // Inside a draggable chapter header: pressing here is not a grab.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className="btn btn-secondary btn-header" onClick={() => onAdd(primary)}>
        <PrimaryIcon size={ICON_SIZE.sm} />
        {LABEL[primary]}
      </button>
      {canPickFromBook && (
        <button
          ref={anchorRef}
          type="button"
          className="btn btn-secondary btn-header"
          aria-label="More ways to add recipes"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDownIcon size={ICON_SIZE.sm} />
        </button>
      )}
      {open && (
        <AnchoredMenu
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          label="Add recipes"
          align="end"
          className="w-48"
        >
          <button
            type="button"
            role="menuitem"
            className="cp-menu__item"
            onClick={() => {
              setOpen(false);
              remember(other);
              onAdd(other);
            }}
          >
            <OtherIcon size={ICON_SIZE.md} />
            {LABEL[other]}
          </button>
        </AnchoredMenu>
      )}
    </span>
  );
}
