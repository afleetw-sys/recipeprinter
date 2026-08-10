"use client";

import { useState } from "react";
import { GripIcon, ICON_SIZE, PlusIcon, TrashIcon } from "@/components/icons";
import type { Section } from "@/types/recipe";

/**
 * Live, in-page organize board: sections as tiles across the full width, recipes
 * as compact draggable chips. Every drag and rename writes STRAIGHT to the
 * live section structure via the callbacks (no draft, no re-suggest) — the parent
 * wires these to `projectMeta` mutators, so a single Undo covers "Suggest a
 * layout". Native HTML5 drag-and-drop handles the 2D moves (between tiles and to
 * a precise slot) that the vertical rail could not.
 */
export function CookbookOrganizeBoard({
  sections,
  onMoveItem,
  onReorderSections,
  onRenameSection,
  onAddSection,
  onDeleteSection,
  selectedIds,
  onToggleSelection,
  onRangeSelection,
  onClearSelection,
}: {
  sections: Section[];
  onMoveItem: (itemId: string, toSectionId: string, toIndex: number) => void;
  onReorderSections: (fromIndex: number, toIndex: number) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onAddSection: () => void;
  onDeleteSection: (sectionId: string) => void;
  selectedIds: ReadonlySet<string>;
  onToggleSelection: (itemId: string) => void;
  onRangeSelection: (itemId: string) => void;
  onClearSelection: () => void;
}) {
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragSection, setDragSection] = useState<number | null>(null);
  const [overSection, setOverSection] = useState<string | null>(null);

  function clearDrag() {
    setDragItem(null);
    setDragSection(null);
    setOverSection(null);
  }

  return (
    <div className="cb-board">
      {sections.map((section, sectionIndex) => (
        <section
          key={section.id}
          className={`cb-board__col ${overSection === section.id ? "is-over" : ""} ${
            dragSection === sectionIndex ? "is-dragging" : ""
          }`}
          onDragOver={(event) => {
            if (dragItem || dragSection !== null) {
              event.preventDefault();
              setOverSection(section.id);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragItem) onMoveItem(dragItem, section.id, section.items.length);
            else if (dragSection !== null && dragSection !== sectionIndex)
              onReorderSections(dragSection, sectionIndex);
            clearDrag();
          }}
        >
          <header className="cb-board__col-head">
            {(section.photoUrl || section.items.find((item) => item.recipe?.image)?.recipe?.image) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="cb-board__section-image"
                src={section.photoUrl || section.items.find((item) => item.recipe?.image)?.recipe?.image}
                alt=""
                draggable={false}
              />
            )}
            <span
              className="cb-board__grip"
              aria-hidden
              draggable
              onDragStart={() => setDragSection(sectionIndex)}
              onDragEnd={clearDrag}
            >
              <GripIcon size={ICON_SIZE.sm} />
            </span>
            <input
              className="cb-board__title"
              value={section.title ?? ""}
              placeholder="Section name"
              aria-label="Section name"
              onChange={(event) => onRenameSection(section.id, event.target.value)}
              onDragStart={(event) => event.preventDefault()}
            />
            <span className="cb-board__count">{section.items.length}</span>
            <button
              type="button"
              className="icon-close-btn cb-board__delete"
              aria-label={`Delete ${section.title || "section"}`}
              onClick={() => onDeleteSection(section.id)}
            >
              <TrashIcon size={ICON_SIZE.sm} />
            </button>
          </header>

          <div className="cb-board__cards">
            {section.items.map((item, itemIndex) => (
              <div
                key={item.id}
                className={`cb-board__card ${dragItem === item.id ? "is-dragging" : ""} ${
                  selectedIds.has(item.id) ? "is-selected" : ""
                }`}
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  setDragItem(item.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(event) => {
                  if (dragItem) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOverSection(section.id);
                  }
                }}
                onDrop={(event) => {
                  if (!dragItem) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onMoveItem(dragItem, section.id, itemIndex);
                  clearDrag();
                }}
                onClick={(event) => {
                  if (event.shiftKey) {
                    event.preventDefault();
                    onRangeSelection(item.id);
                  } else if (event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    onToggleSelection(item.id);
                  } else if (selectedIds.size) {
                    onClearSelection();
                  }
                }}
              >
                {item.recipe?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.recipe.image} alt="" draggable={false} />
                ) : (
                  <span className="cb-board__card-placeholder" aria-hidden />
                )}
                <span className="cb-board__card-title">
                  {item.recipe?.title || item.title || "Recipe"}
                </span>
              </div>
            ))}
            {section.items.length === 0 && <p className="cb-board__empty">Drop recipes here</p>}
          </div>

        </section>
      ))}

      <button type="button" className="btn btn-secondary cb-board__add" onClick={onAddSection}>
        <PlusIcon size={ICON_SIZE.md} />
        <span>Add section</span>
        {selectedIds.size > 0 && <span className="cb-board__add-count">{selectedIds.size} selected</span>}
      </button>
    </div>
  );
}
