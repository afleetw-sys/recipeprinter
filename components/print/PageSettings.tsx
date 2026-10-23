"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Checkbox, SelectTile } from "@/components/Controls";
import { ChevronDownIcon, ICON_SIZE, TrashIcon } from "@/components/icons";
import { MoveToSectionMenu } from "@/components/print/MoveToSectionMenu";
import type { NavItem } from "@/lib/usePrintSheets";

/**
 * The right panel's Page tab: everything the page in front of the cook can do,
 * in the order they'd reach for it.
 *
 *   1. Which page this is, in the rail's own words.
 *   2. How it looks: one choice, shown as small pictures of the finished page.
 *   3. Its words, as plain fields that write to the page as they type.
 *   4. Its switches, then where it lives, then removing it.
 *
 * The print page decides what each kind of page offers (see `renderPageSettings`
 * in app/print/page.tsx); this only lays it out, so every page reads the same.
 */

/** A small picture of the finished page, for a Look tile. */
export type LookPreviewKind =
  | "text"
  | "text-on-photo"
  | "text-with-photo"
  | "own-image"
  | "blank"
  | "recipe-none"
  | "recipe-in-page"
  | "recipe-full-page";

export interface LookOption {
  id: string;
  label: string;
  preview: LookPreviewKind;
}

export interface PageField {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}

export interface PageToggle {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function PageSettings({
  page,
  name,
  title,
  look,
  lookAction,
  fields,
  toggles,
  chapter,
  note,
  remove,
}: {
  page: NavItem | null;
  /** What this page is called, as the rail calls it. */
  name: string;
  /** Its own title, when that says more than its name (a recipe's, a chapter's). */
  title?: string;
  look?: { label: string; value: string | null; options: LookOption[]; onChange: (id: string) => void } | null;
  /** The control that goes with the chosen look: choosing its photo or image. */
  lookAction?: ReactNode;
  fields?: PageField[];
  toggles?: PageToggle[];
  /** Which chapter a recipe is in, moved with the same menu its toolbar's
      Move button and the rail's right-click open. */
  chapter?: ChapterChoice | null;
  note?: string;
  remove?: { label: string; onRemove: () => void } | null;
}) {
  if (!page) {
    return <p className="recipe-page-settings__note">Select a page to see its settings.</p>;
  }

  return (
    <div className="recipe-page-settings">
      <div className="recipe-page-settings__head">
        <span className="recipe-config-label">{name}</span>
        {title && title !== name && <p className="recipe-page-settings__title">{title}</p>}
      </div>

      {look && (
        <div className="recipe-config-section">
          <span className="recipe-config-label" id="recipe-page-look-label">
            {look.label}
          </span>
          <div
            className="recipe-page-look"
            style={{ gridTemplateColumns: `repeat(${look.options.length}, 1fr)` }}
            role="radiogroup"
            aria-labelledby="recipe-page-look-label"
          >
            {look.options.map((option) => (
              <SelectTile key={option.id} selected={look.value === option.id} className="recipe-page-look__tile">
                <input
                  type="radio"
                  name="recipe-page-look"
                  className="sr-only"
                  checked={look.value === option.id}
                  onChange={() => look.onChange(option.id)}
                />
                <LookPreview kind={option.preview} />
                <span className="recipe-page-look__label">{option.label}</span>
              </SelectTile>
            ))}
          </div>
          {lookAction}
        </div>
      )}

      {fields && fields.length > 0 && (
        <div className="recipe-config-section recipe-page-fields">
          {fields.map((field) => (
            <PageTextField key={`${page.recipeId}:${field.id}`} field={field} />
          ))}
        </div>
      )}

      {toggles && toggles.length > 0 && (
        <div className="recipe-config-section">
          {toggles.map((toggle) => (
            <Checkbox
              key={toggle.id}
              label={toggle.label}
              hint={toggle.hint}
              checked={toggle.checked}
              disabled={toggle.disabled}
              onChange={(event) => toggle.onChange(event.target.checked)}
            />
          ))}
        </div>
      )}

      {chapter && <ChapterPicker chapter={chapter} what={title} />}

      {note && <p className="recipe-page-settings__note">{note}</p>}

      {remove && (
        <div className="recipe-page-settings__remove">
          <button type="button" className="btn btn-ghost btn-ghost--danger btn-compact" onClick={remove.onRemove}>
            <TrashIcon size={ICON_SIZE.sm} />
            {remove.label}
          </button>
        </div>
      )}
    </div>
  );
}

export interface ChapterChoice {
  currentId: string;
  currentTitle: string;
  options: Array<{ id: string; title: string }>;
  onMove: (sectionId: string) => void;
  onNewChapter?: () => void;
}

/**
 * The recipe's chapter, as a field that opens the book's own Move menu: the
 * one the toolbar's Move button and the rail's right-click open, New chapter
 * included, so there is one way to move a recipe wherever it is started from.
 */
function ChapterPicker({ chapter, what }: { chapter: ChapterChoice; what?: string }) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="recipe-config-section">
      <span className="recipe-config-label">Chapter</span>
      <button
        type="button"
        className="field field--compact recipe-page-chapter"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuAt)}
        onClick={(event) => {
          if (menuAt) {
            setMenuAt(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuAt({ x: rect.left, y: rect.bottom + 6 });
        }}
      >
        <span>{chapter.currentTitle}</span>
        <ChevronDownIcon size={ICON_SIZE.sm} />
      </button>
      {menuAt && (
        <MoveToSectionMenu
          anchor={menuAt}
          heading={`Move ${what ? `“${what}”` : "this recipe"} to`}
          sections={chapter.options.filter((option) => option.id !== chapter.currentId)}
          onMove={chapter.onMove}
          onNewSection={chapter.onNewChapter}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

/**
 * One line of the page's words. It keeps its own draft and writes to the page
 * a beat after typing stops (and on leaving the field), rather than on every
 * key: each write re-lays-out the book, and the page's own inline fields avoid
 * that for the same reason. A change made on the page comes back in here once
 * this field is not the one being typed in.
 */
function PageTextField({ field }: { field: PageField }) {
  const [draft, setDraft] = useState(field.value);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(field);
  latest.current = field;

  useEffect(() => {
    if (!focused.current) setDraft(field.value);
  }, [field.value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (value: string) => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (value !== latest.current.value) latest.current.onCommit(value);
  };
  const change = (value: string) => {
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(value), 400);
  };
  const shared = {
    id: `page-field-${field.id}`,
    className: "field field--compact recipe-page-fields__input",
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit(draft);
    },
  };

  return (
    <label className="recipe-page-fields__row" htmlFor={shared.id}>
      <span className="recipe-config-sublabel">{field.label}</span>
      {field.multiline ? (
        <textarea {...shared} rows={3} onChange={(event) => change(event.target.value)} />
      ) : (
        <input {...shared} type="text" onChange={(event) => change(event.target.value)} />
      )}
    </label>
  );
}

/**
 * A tiny page for each Look: grey lines are words, a filled block is a photo.
 * Built from the same parts as the recipe photo tiles' previews, so every
 * picture in the panel is drawn the same way.
 */
function LookPreview({ kind }: { kind: LookPreviewKind }) {
  const lines = (
    <>
      <span className="recipe-photo-preview__line" />
      <span className="recipe-photo-preview__line" />
      <span className="recipe-photo-preview__line recipe-photo-preview__line--short" />
    </>
  );
  if (kind === "recipe-full-page") {
    return (
      <span className="recipe-photo-preview recipe-photo-preview--spread" aria-hidden>
        <span className="recipe-photo-preview__page recipe-photo-preview__page--photo" />
        <span className="recipe-photo-preview__page">{lines}</span>
      </span>
    );
  }
  const pageClass =
    kind === "own-image"
      ? "recipe-photo-preview__page recipe-photo-preview__page--photo"
      : kind === "text-on-photo"
        ? "recipe-photo-preview__page recipe-photo-preview__page--photo recipe-look-preview--over"
        : "recipe-photo-preview__page";
  return (
    <span className="recipe-photo-preview" aria-hidden>
      <span className={pageClass}>
        {(kind === "recipe-in-page" || kind === "text-with-photo") && <span className="recipe-photo-preview__photo" />}
        {kind === "own-image" && <span className="recipe-look-preview__sun" />}
        {kind !== "own-image" && kind !== "blank" && lines}
      </span>
    </span>
  );
}
