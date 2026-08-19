import type { PrintCardSize } from "@/components/RecipeCardPrint";

// Real card dimensions in CSS px (96px per inch), used only to size the
// on-screen scaler/thumbnails so a card looks true-to-size, just smaller.
// Matches --recipe-card-width/-min-height in globals.css: 0.125in per side
// smaller than the nominal "6x4"/"Letter" label, a safety margin for real
// printers' hardware non-printable edge (see that variable's comment).
//
// Shared by the print page, the scaled-page deck/rail renderer, and the theme
// thumbnails — kept here so those can live in their own files without importing
// back into app/print/page.tsx.
export const PAGE_DIMS: Record<PrintCardSize, { w: number; h: number }> = {
  letter: { w: 8.25 * 96, h: 10.75 * 96 },
  "card-6x4": { w: 5.75 * 96, h: 3.75 * 96 },
};
