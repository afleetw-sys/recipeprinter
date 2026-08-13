import type { PhotoStyle } from "@/lib/project";

// The single "how does this recipe show its photo" vocabulary — the book-wide
// default (Print setup) and the per-recipe override both use these exact three
// options, so there's one list rather than a picker + a separate on/off. Shared
// by the desktop controls, the per-recipe control, and the mobile structure
// sheet.
export const PHOTO_STYLE_OPTIONS: Array<{ id: PhotoStyle; label: string; short: string; hint: string }> = [
  { id: "none", label: "None", short: "None", hint: "No recipe photos" },
  { id: "card", label: "In the recipe card", short: "In card", hint: "A photo in each card’s header" },
  { id: "full", label: "Full page", short: "Full page", hint: "A full-page photo facing each recipe" },
];

// Tiny page illustration for each photo style — a blank card, a card with a
// header photo, and a full-page facing photo — so the choice reads at a glance.
export function PhotoStylePreview({ id }: { id: PhotoStyle }) {
  const lines = (
    <>
      <span className="recipe-photo-preview__line" />
      <span className="recipe-photo-preview__line" />
      <span className="recipe-photo-preview__line recipe-photo-preview__line--short" />
    </>
  );
  if (id === "full") {
    return (
      <span className="recipe-photo-preview recipe-photo-preview--spread" aria-hidden>
        <span className="recipe-photo-preview__page recipe-photo-preview__page--photo" />
        <span className="recipe-photo-preview__page">{lines}</span>
      </span>
    );
  }
  return (
    <span className="recipe-photo-preview" aria-hidden>
      <span className="recipe-photo-preview__page">
        {id === "card" && <span className="recipe-photo-preview__photo" />}
        {lines}
      </span>
    </span>
  );
}
