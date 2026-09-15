"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";
import { SegmentedControl } from "@/components/Controls";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

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
  showTitle,
  onRename,
  cookbookMode,
  canBecomeCookbook,
  isLegacy,
  onSwitchToCards,
  onSwitchToCookbook,
  onCopyToCookbook,
  onCopyToCards,
}: {
  title: string;
  /** Whether this project is in the account yet. A name is a thing you can come
      back to; until it is saved there is nothing to come back to, and the
      "name" is a stand-in generated from the first recipe. Showing that made
      the bar claim a project existed when only a draft did — and made the
      rename it offers a change to something nothing would remember. */
  showTitle: boolean;
  onRename: (next: string | undefined) => void;
  cookbookMode: boolean;
  /** Whether becoming a cookbook is offered at all (the feature flag). */
  canBecomeCookbook: boolean;
  /** Whether this document has already entered the old shared-document
      cookbook mechanism — a `stashedCookbook`, or `cookbookMode` saved under
      the old code paths — and so keeps the reversible in-place toggle
      (`onSwitchToCards`/`onSwitchToCookbook`) forever. A document born from
      `onCopyToCookbook`/`onCopyToCards` is never legacy, no matter what
      `cookbookMode` says — see `isLegacyCookbookMechanism` in lib/project.ts. */
  isLegacy: boolean;
  onSwitchToCards: () => void;
  onSwitchToCookbook: () => void;
  /** One-way: copies the current recipes into a brand-new cookbook project.
      Only offered when `!isLegacy`. */
  onCopyToCookbook: () => void;
  /** One-way: copies this book's recipes into a brand-new cards project.
      Only offered when `!isLegacy`. */
  onCopyToCards: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Select the whole name on entry: renaming is nearly always replacing, and
  // making someone clear it by hand first is a small tax on the common case.
  useLayoutEffect(() => {
    if (!editing) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [editing]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useMenuDismiss(menuRef, closeMenu, { enabled: menuOpen });

  function commit() {
    setEditing(false);
    // Clearing the field restores the inherited name rather than leaving the
    // project blank — an empty title is never what someone meant by clearing it.
    onRename(draft.trim() || undefined);
  }

  if (editing && showTitle) {
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
    <div className={`rp-project-heading ${showTitle ? "" : "rp-project-heading--kind-only"}`}>
      {showTitle && (
      <>
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
      </>
      )}

      {/*
        Two shapes, because the control has two jobs.

        In recipe cards it is an OFFER: both kinds are shown side by side, so
        the cookbook is something you can see rather than something you have to
        suspect is behind a menu. Nobody discovered the paid half of the product
        by using the free half, and a closed dropdown was most of the reason.
        For a legacy document that offer is still the reversible toggle; for
        everything else, it's the one-way copy — see `isLegacy`.

        In a cookbook it is STATUS: you are already in the thing, so it shrinks
        back to a chip that names what you are looking at and quietly offers the
        way back (a real "back" for a legacy document, a copy-out for anything
        else).
      */}
      {!cookbookMode && canBecomeCookbook ? (
        isLegacy ? (
          <SegmentedControl
            className="rp-project-heading__kinds"
            label="Document kind"
            value="cards"
            options={[
              { id: "cards", label: "Recipe cards" },
              {
                id: "book",
                /* The tab makes the cookbook visible; the flag says it is worth
                   looking at. Only in cards mode, which is the only mode where
                   this is news — inside a cookbook it would be labelling the
                   thing you are already using. */
                label: (
                  <>
                    Cookbook
                    <span className="rp-project-heading__new">New</span>
                  </>
                ),
              },
            ]}
            onChange={(next) => {
              if (next === "book") onSwitchToCookbook();
            }}
          />
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setConfirmOpen(true)}
            >
              Make it a cookbook
              <span className="rp-project-heading__new">New</span>
            </button>
            <ConfirmDialog
              open={confirmOpen}
              title="Make a cookbook?"
              description="We'll copy your recipes into a new cookbook. Your recipe cards stay just as they are."
              tone="primary"
              confirmLabel="Make a cookbook"
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() => {
                setConfirmOpen(false);
                onCopyToCookbook();
              }}
            />
          </>
        )
      ) : (
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
          <div className="cp-menu rp-project-heading__menu" role="menu">
            {/* For a non-legacy cookbook there is no real "Recipe cards"
                destination to show as a status item beside the one real
                action below — that would be a second, dead-looking control
                for the same idea. Legacy documents (a real switch back) and
                anything not currently a cookbook (already active, harmless)
                still get it. */}
            {(isLegacy || !cookbookMode) && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!cookbookMode}
                className={`cp-menu__item cp-menu__item--stacked ${!cookbookMode ? "is-active" : ""}`}
                onClick={() => {
                  setMenuOpen(false);
                  if (cookbookMode) onSwitchToCards();
                }}
              >
                <span className="cp-menu__label">Recipe cards</span>
                <span className="cp-menu__note">
                  One card per recipe, free to print.
                </span>
              </button>
            )}

            {isLegacy && canBecomeCookbook && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={cookbookMode}
                className={`cp-menu__item cp-menu__item--stacked ${cookbookMode ? "is-active" : ""}`}
                onClick={() => {
                  setMenuOpen(false);
                  if (!cookbookMode) onSwitchToCookbook();
                }}
              >
                <span className="cp-menu__label">Cookbook</span>
                <span className="cp-menu__note">
                  A bound book with a cover and chapters.
                </span>
              </button>
            )}

            {!isLegacy && cookbookMode && (
              <button
                type="button"
                role="menuitem"
                className="cp-menu__item cp-menu__item--stacked"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                <span className="cp-menu__label">Make recipe cards from this book</span>
                <span className="cp-menu__note">A separate, independent project.</span>
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {!isLegacy && cookbookMode && (
        <ConfirmDialog
          open={confirmOpen}
          title="Make recipe cards?"
          description="We'll copy this book's recipes into new recipe cards. Your cookbook stays just as it is."
          tone="primary"
          confirmLabel="Make recipe cards"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onCopyToCards();
          }}
        />
      )}
    </div>
  );
}
