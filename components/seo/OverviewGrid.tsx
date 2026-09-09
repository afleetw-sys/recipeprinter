import type { ComponentType } from "react";

/**
 * A grid of short, equal-weight capability cards.
 *
 * The landing template's `FeatureRows` pairs every claim with a proof image
 * and gives it a full row, which is right for a page arguing one thing three
 * times. An overview page makes a dozen small claims at once, and a dozen
 * image rows would bury all of them, so these stay compact and let the reader
 * scan the whole surface at once.
 *
 * Cards sit on one grid with a shared row height, so a longer body pushes its
 * whole row rather than leaving a card floating against dead space.
 */
export type OverviewItem = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  body: string;
};

export function OverviewGrid({
  items,
  columns = 3,
}: {
  items: OverviewItem[];
  /** Widest column count. Pick the one the items fill: three leaves one
      stranded on a row of four, and four leaves two. */
  columns?: 2 | 3 | 4;
}) {
  return (
    <ul
      className={`grid gap-cp-3 sm:grid-cols-2${
        columns === 3 ? " lg:grid-cols-3" : columns === 4 ? " lg:grid-cols-4" : ""
      }`}
    >
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="card p-cp-5 flex flex-col gap-cp-3">
          <span className="glyph-warm">
            <Icon size={20} />
          </span>
          <h3 className="font-extrabold tracking-[-0.02em] text-cp-h2">{title}</h3>
          <p className="text-ink-soft text-cp-body leading-relaxed">{body}</p>
        </li>
      ))}
    </ul>
  );
}
