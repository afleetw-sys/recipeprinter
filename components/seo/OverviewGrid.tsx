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
  /** Optional: OverviewList renders no icons, so items written only for the
      list have nothing to supply here. */
  icon?: ComponentType<{ size?: number }>;
  title: string;
  body: string;
};

/**
 * The same items at a lower volume: hairline rules instead of cards, no icon.
 *
 * Nine equal cards up front asks the reader to weigh nine things at once and
 * gives them no way in. The few claims worth arguing get a feature row with a
 * photograph; everything else belongs here, where it can be skimmed or skipped
 * without competing with them.
 */
export function OverviewList({ items }: { items: OverviewItem[] }) {
  return (
    <ul className="grid gap-x-cp-6 sm:grid-cols-2">
      {items.map(({ title, body }) => (
        <li key={title} className="border-t border-line py-cp-4">
          <h3 className="text-cp-body font-extrabold tracking-[-0.02em]">{title}</h3>
          <p className="mt-cp-1 text-ink-soft text-cp-small leading-relaxed">{body}</p>
        </li>
      ))}
    </ul>
  );
}

export function OverviewGrid({
  items,
  columns = 3,
}: {
  items: OverviewItem[];
  /** Widest column count. Drop to 2 for a short set, so a tall card never sits
      alone against an empty slot at the end of a row. */
  columns?: 2 | 3;
}) {
  return (
    <ul
      className={`grid gap-cp-3 sm:grid-cols-2${columns === 3 ? " lg:grid-cols-3" : ""}`}
    >
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="card p-cp-5 flex flex-col gap-cp-3">
          {Icon && (
            <span className="glyph-warm">
              <Icon size={20} />
            </span>
          )}
          <h3 className="font-extrabold tracking-[-0.02em] text-cp-h2">{title}</h3>
          <p className="text-ink-soft text-cp-body leading-relaxed">{body}</p>
        </li>
      ))}
    </ul>
  );
}
