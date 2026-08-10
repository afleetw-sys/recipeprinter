/**
 * How to lay out a photo collage of `count` images so it fills its frame with
 * NO empty cells — used by both the cover grid and a section's photo page, so a
 * 2-photo section reads as a clean pair, not a 3×3 grid missing seven photos.
 *
 * `firstSpans` makes the first photo a full-width banner, which fills the odd
 * one out (e.g. 3 = banner + 2, 5 = banner + 2×2, 7 = banner + 2×3). Layouts are
 * chosen per count so every cell is filled.
 */
export interface PhotoGridLayout {
  columns: number;
  firstSpans: boolean;
}

const LAYOUTS: Record<number, PhotoGridLayout> = {
  1: { columns: 1, firstSpans: false },
  2: { columns: 2, firstSpans: false }, // 1 row of 2
  3: { columns: 2, firstSpans: true }, //  banner + 2
  4: { columns: 2, firstSpans: false }, // 2×2
  5: { columns: 2, firstSpans: true }, //  banner + 2×2
  6: { columns: 2, firstSpans: false }, // 2×3
  7: { columns: 3, firstSpans: true }, //  banner + 2×3
  8: { columns: 2, firstSpans: false }, // 2×4
  9: { columns: 3, firstSpans: false }, // 3×3
};

export function photoGridLayout(count: number): PhotoGridLayout {
  const n = Math.min(Math.max(Math.floor(count), 0), 9);
  return LAYOUTS[n] ?? { columns: 1, firstSpans: false };
}
