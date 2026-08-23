"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";

/**
 * What you are looking at, in the middle of the bar: its name, and what kind of
 * document it is.
 *
 * These two facts answer "which thing is this?", which is a different question
 * from "what can I do to it?" — so they sit apart from the controls rather than
 * queued up with them.
 */
export function ProjectHeading({
  title,
  onRename,
  cookbookMode,
  canBecomeCookbook,
  onSwitchToCards,
  onSwitchToCookbook,
}: {
  title: string;
  onRename: (next: string | undefined) => void;
  cookbookMode: boolean;
  /** Whether becoming a cookbook is offered at all (the feature flag). */
  canBecomeCookbook: boolean;
  onSwitchToCards: () => void;
  onSwitchToCookbook: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Select the whole name on entry: renaming is nearly always replacing, and
  // making someone clear it by hand first is a small tax on the common case.
  useLayoutEffect(() => {
    if (!editing) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function commit() {
    setEditing(false);
    // Clearing the field restores the inherited name rather than leaving the
    // project blank — an empty title is never what someone meant by clearing it.
    onRename(draft.trim() || undefined);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="rp-project-heading__input"
        value={draft}
        aria-label="Project name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="rp-project-heading">
      {/*
        Double-click to rename, as asked. It is also a real button that opens on
        Enter — double-click alone is invisible to anyone navigating by keyboard,
        and a name you cannot reach is a name you cannot fix. The single click
        does nothing on purpose: this sits in the middle of a toolbar, and a
        title that turned into a text field every time it was brushed past would
        be worse than one that took two clicks.
      */}
      <button
        type="button"
        className="rp-project-heading__title"
        title={`${title} — double-click to rename`}
        onDoubleClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          setDraft(title);
          setEditing(true);
        }}
      >
        {title}
      </button>

      <div className="rp-project-heading__kind" ref={menuRef}>
        <button
          type="button"
          className="rp-project-heading__kind-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {cookbookMode ? "Cookbook" : "Recipe cards"}
          <ChevronDownIcon size={ICON_SIZE.xs} />
        </button>

        {menuOpen && (
          <div className="rp-project-heading__menu" role="menu">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!cookbookMode}
              className={`rp-project-heading__option ${!cookbookMode ? "is-active" : ""}`}
              onClick={() => {
                setMenuOpen(false);
                if (cookbookMode) onSwitchToCards();
              }}
            >
              <span className="rp-project-heading__option-name">Recipe cards</span>
              <span className="rp-project-heading__option-note">
                One card per recipe, free to print.
              </span>
            </button>

            {canBecomeCookbook && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={cookbookMode}
                className={`rp-project-heading__option ${cookbookMode ? "is-active" : ""}`}
                onClick={() => {
                  setMenuOpen(false);
                  if (!cookbookMode) onSwitchToCookbook();
                }}
              >
                <span className="rp-project-heading__option-name">Cookbook</span>
                <span className="rp-project-heading__option-note">
                  A bound book with a cover and chapters.
                </span>
              </button>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
