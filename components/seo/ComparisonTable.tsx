"use client";

import { useEffect, useRef } from "react";
import { PriceText } from "@/components/PriceText";
import { CheckIcon, ICON_SIZE } from "@/components/icons";
import type { ComparisonValue } from "@/lib/seoLandingPages";

/** The feature column on a phone: frozen at the left edge while the answers
    scroll under it, with a hairline marking where they pass. */
const FROZEN = "max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-card";
// A drawn line, not a border: a collapsed table border stays behind when its
// cell sticks.
const FROZEN_EDGE =
  "max-sm:after:absolute max-sm:after:inset-y-0 max-sm:after:right-0 max-sm:after:w-px max-sm:after:bg-line-strong max-sm:after:content-['']";

/**
 * A head-to-head feature table for a competitor comparison page.
 *
 * Tick, dash, or a tick with the terms attached. That is the convention every
 * comparison table uses, and its whole virtue is that nobody has to be taught
 * it. Rows sit in labelled groups, because ten unbroken rows is the shape a
 * reader skims past rather than reads.
 *
 * Our column is one unbroken tinted band from the header to the last row. The
 * group labels sit on it rather than cutting across it: a full-width banded
 * row chopped the column into four disconnected blocks and made the whole
 * thing read as a spreadsheet.
 *
 * Phones get the same three columns, one row per feature, because that is
 * what makes the table quick to read. Two earlier phone layouts put each
 * feature's name on its own line above its answers: that doubled every row
 * and broke the tinted band into blocks. Answers wrap to fit the screen. The
 * columns are sized by the browser from their content, never fixed widths,
 * so no column is ever narrower than its longest word plus its padding (fixed
 * widths let "RecipePrinter" run straight through the padding into the next
 * column). Only if even that doesn't fit does the table scroll sideways, with
 * the feature names frozen at the left like a spreadsheet's first column.
 *
 * On a phone the product names are pinned under the site header as the page
 * scrolls, so a row halfway down still says which column is which. They are a
 * separate strip, not the table's own header: a sideways-scrolling box is
 * also a vertical scroll container, so a sticky header inside it would stick
 * to the box and never to the page. The strip follows the table's sideways
 * scroll instead.
 *
 * The table is worth reading only if the competitor wins the rows it genuinely
 * wins, so those render exactly like ours.
 */
export function ComparisonTable({
  competitor,
  groups,
}: {
  competitor: string;
  groups: {
    title: string;
    rows: { feature: string; us: ComparisonValue; them: ComparisonValue }[];
  }[];
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const stripCornerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // The strip copies the table's real column widths, since those come from
  // the content and can't be known ahead of time.
  useEffect(() => {
    const table = tableRef.current;
    const strip = stripRef.current;
    if (!table || !strip || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const cells = table.querySelector("tbody tr:nth-child(2)")?.children;
      if (!cells || cells.length < 3) return;
      const widths = Array.from(cells, (c) => `${c.getBoundingClientRect().width}px`);
      strip.style.gridTemplateColumns = widths.join(" ");
      strip.style.width = `${table.getBoundingClientRect().width}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  // The tint that makes our column a single vertical band. Applied to every
  // cell in the column, including the header and the group-label rows, so it
  // never breaks.
  //
  // Cornflower, not clay. Clay is the system's "this TELLS you something"
  // colour and it carries the paywall and the warnings, so a column of clay
  // ticks reads as a column of cautions — the opposite of what a tick means.
  const ours = "bg-[var(--cp-accent-soft)]";
  const pad = "px-cp-4 max-sm:px-cp-3";
  const nameCell = `${pad} pb-cp-3 pt-cp-4 text-cp-body font-extrabold tracking-[-0.02em] text-ink max-sm:pt-cp-3 max-sm:text-cp-small`;

  const cell = (v: ComparisonValue, mine: boolean) => (
    <td className={`${pad} py-cp-4 align-middle ${mine ? ours : ""}`}>
      {/* The column header is hidden on a phone (the pinned strip shows the
          names instead), so each cell names its product for a screen reader. */}
      <span className="hidden max-sm:sr-only max-sm:inline">
        {mine ? "RecipePrinter: " : `${competitor}: `}
      </span>
      {v === false ? (
        <span className="inline-flex items-center">
          <span className="h-px w-4 rounded bg-line-strong" aria-hidden />
          <span className="sr-only">No</span>
        </span>
      ) : (
        <span className="inline-flex items-baseline gap-cp-2 max-sm:gap-cp-1">
          <span className="glyph-accent flex-none translate-y-0.5">
            <CheckIcon size={ICON_SIZE.sm} />
          </span>
          <span className="sr-only">Yes</span>
          {typeof v === "string" && (
            <span className="text-cp-small font-medium leading-snug text-ink">
              {/* Our column only: a competitor's price is theirs, in whatever
                  currency they quote it. */}
              {mine ? <PriceText>{v}</PriceText> : v}
            </span>
          )}
        </span>
      )}
    </td>
  );

  // Same split on both: the strip's grid and the table's columns.
  const columns = (
    <colgroup>
      <col className="max-sm:w-[30%]" />
      <col className="w-[26%] max-sm:w-[35%]" />
      <col className="w-[26%] max-sm:w-[35%]" />
    </colgroup>
  );

  return (
    <div className="rounded-2xl border border-line bg-card sm:overflow-hidden">
      {/* Phone only, and only for the eye: the table's own header carries
          the names for a screen reader. */}
      <div
        aria-hidden
        className="sticky top-[59px] z-[1] overflow-hidden rounded-t-2xl border-b border-line-strong bg-card sm:hidden"
      >
        <div ref={stripRef} className="grid w-full grid-cols-[30%_35%_35%]">
          {/* Held still against the strip's own movement, like the frozen
              column below it. */}
          <div ref={stripCornerRef} className={`relative z-[1] bg-card ${FROZEN_EDGE}`} />
          <div className={`${nameCell} ${ours}`}>RecipePrinter</div>
          <div className={nameCell}>{competitor}</div>
        </div>
      </div>
      <div
        className="max-sm:overflow-x-auto max-sm:rounded-b-2xl"
        onScroll={(event) => {
          const x = event.currentTarget.scrollLeft;
          if (stripRef.current) stripRef.current.style.transform = `translateX(${-x}px)`;
          if (stripCornerRef.current) stripCornerRef.current.style.transform = `translateX(${x}px)`;
        }}
      >
        <table ref={tableRef} className="w-full border-collapse text-left">
          <caption className="sr-only">
            RecipePrinter compared with {competitor}, feature by feature
          </caption>
          {columns}
          <thead className="max-sm:hidden">
            <tr>
              <th scope="col" className={`border-b border-line-strong ${pad} pb-cp-3 pt-cp-4`} aria-label="Feature" />
              <th scope="col" className={`${ours} border-b border-line-strong ${nameCell}`}>
                RecipePrinter
              </th>
              <th scope="col" className={`border-b border-line-strong ${nameCell}`}>
                {competitor}
              </th>
            </tr>
          </thead>
          {groups.map((group, groupIndex) => (
            <tbody key={group.title}>
              <tr>
                {/* No wrapping: the label runs on over the empty cells beside
                    it rather than breaking onto two lines. On a phone it is
                    lifted out of the layout so its length can't widen the
                    feature column; the space keeps the row's height. */}
                <th
                  scope="colgroup"
                  className={`${pad} ${FROZEN} whitespace-nowrap pb-cp-2 text-cp-caption font-bold uppercase tracking-[0.11em] text-ink-soft ${
                    groupIndex === 0 ? "pt-cp-3" : "pt-cp-6"
                  }`}
                >
                  <span className="max-sm:absolute max-sm:left-cp-3">{group.title}</span>
                  <span className="sm:hidden" aria-hidden>
                    {"\u00a0"}
                  </span>
                </th>
                {/* Empty, but tinted and padded to match, so the band and the
                    row rhythm both continue through the label. */}
                <td className={ours} aria-hidden />
                <td aria-hidden />
              </tr>
              {group.rows.map((row) => (
                <tr key={row.feature} className="border-t border-line">
                  <th
                    scope="row"
                    className={`${pad} ${FROZEN} ${FROZEN_EDGE} py-cp-4 text-cp-body font-medium max-sm:hyphens-auto leading-snug text-ink max-sm:text-cp-small max-sm:font-semibold`}
                  >
                    {row.feature}
                  </th>
                  {cell(row.us, true)}
                  {cell(row.them, false)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
