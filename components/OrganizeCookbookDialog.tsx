"use client";

import { useEffect, useMemo, useState } from "react";
import { ICON_SIZE, PlusIcon, XIcon } from "@/components/icons";
import { moveOrganizationItem, suggestCookbookOrganization, type CookbookOrganizationDraft } from "@/lib/cookbookOrganizer";
import { uid } from "@/lib/ids";
import type { QueueItem } from "@/types/recipe";

export function OrganizeCookbookDialog({
  open,
  items,
  onApply,
  onCancel,
  onSectionCreated,
  onOpenerToggled,
}: {
  open: boolean;
  items: QueueItem[];
  onApply: (draft: CookbookOrganizationDraft) => void;
  onCancel: () => void;
  onSectionCreated: () => void;
  onOpenerToggled: (enabled: boolean) => void;
}) {
  const [draft, setDraft] = useState<CookbookOrganizationDraft>({ sections: [] });
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const titles = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.id,
          {
            title: item.recipe?.title || item.title,
            image: item.recipe?.image,
          },
        ]),
      ),
    [items],
  );

  useEffect(() => {
    if (open) setDraft(suggestCookbookOrganization(items));
  }, [open, items]);

  function addSection() {
    setDraft((current) => ({
      sections: [
        ...current.sections,
        { id: `manual-${uid()}`, title: "New section", showOpener: true, itemIds: [] },
      ],
    }));
    onSectionCreated();
  }

  function moveSection(index: number, delta: number) {
    setDraft((current) => {
      const sections = current.sections.slice();
      const [section] = sections.splice(index, 1);
      if (!section) return current;
      sections.splice(Math.max(0, Math.min(index + delta, sections.length)), 0, section);
      return { sections };
    });
  }

  if (!open) return null;

  return (
    <section className="cookbook-organize no-print" aria-labelledby="organize-cookbook-title">
      <div className="cookbook-organize__panel">
      <header className="cookbook-organize__header">
        <div>
          <h2 id="organize-cookbook-title">Organize cookbook</h2>
          <p>Here&apos;s a suggested structure. Adjust anything before applying it.</p>
        </div>
        <button type="button" className="icon-close-btn" aria-label="Close" onClick={onCancel}>
          <XIcon size={ICON_SIZE.md} />
        </button>
      </header>

      <div className="cookbook-organize__sections">
        {draft.sections.map((section, sectionIndex) => (
          <section
            className={`cookbook-organize__section ${
              section.title === "Uncategorized" ? "is-uncategorized" : ""
            }`}
            key={section.id}
            onDragOver={(event) => {
              if (draggingItemId) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggingItemId) return;
              setDraft((current) => moveOrganizationItem(current, draggingItemId, section.id));
              setDraggingItemId(null);
            }}
          >
            <div className="cookbook-organize__section-heading">
              <input
                value={section.title}
                aria-label="Section name"
                onChange={(event) =>
                  setDraft((current) => ({
                    sections: current.sections.map((candidate) =>
                      candidate.id === section.id
                        ? { ...candidate, title: event.target.value }
                        : candidate,
                    ),
                  }))
                }
              />
              <span>{section.itemIds.length}</span>
              <div className="cookbook-organize__order">
                <button type="button" aria-label={`Move ${section.title} earlier`} disabled={sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}>↑</button>
                <button type="button" aria-label={`Move ${section.title} later`} disabled={sectionIndex === draft.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)}>↓</button>
              </div>
            </div>
            <label className="cookbook-organize__opener">
              <input
                type="checkbox"
                checked={section.showOpener}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setDraft((current) => ({
                    sections: current.sections.map((candidate) =>
                      candidate.id === section.id ? { ...candidate, showOpener: enabled } : candidate,
                    ),
                  }));
                  onOpenerToggled(enabled);
                }}
              />
              Section opener
            </label>
            <div className="cookbook-organize__recipes">
              {section.itemIds.map((itemId) => (
                <div
                  key={itemId}
                  className="cookbook-organize__recipe"
                  draggable
                  onDragStart={() => setDraggingItemId(itemId)}
                  onDragEnd={() => setDraggingItemId(null)}
                >
                  <div className="cookbook-organize__recipe-summary">
                    {titles.get(itemId)?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={titles.get(itemId)?.image} alt="" draggable={false} />
                    ) : (
                      <span className="cookbook-organize__recipe-placeholder" aria-hidden />
                    )}
                    <span>{titles.get(itemId)?.title || "Recipe"}</span>
                  </div>
                  <select
                    aria-label={`Move ${titles.get(itemId)?.title || "recipe"} to section`}
                    value={section.id}
                    onChange={(event) =>
                      setDraft((current) => moveOrganizationItem(current, itemId, event.target.value))
                    }
                  >
                    {draft.sections.map((target) => (
                      <option key={target.id} value={target.id}>{target.title || "Untitled section"}</option>
                    ))}
                  </select>
                </div>
              ))}
              {section.itemIds.length === 0 && <p>Drag recipes here</p>}
            </div>
          </section>
        ))}
        <button type="button" className="cookbook-organize__add" onClick={addSection}>
          <PlusIcon size={ICON_SIZE.sm} />
          Add section
        </button>
      </div>

      <footer className="cookbook-organize__actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => onApply(draft)}>Save</button>
      </footer>
      </div>
    </section>
  );
}
