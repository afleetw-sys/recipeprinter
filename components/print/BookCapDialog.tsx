"use client";

import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/Controls";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";

/**
 * More recipes arrived than an unbought cookbook's free preview holds (a whole
 * Paprika library, say). A toast said so for a few seconds; this stays until
 * it's answered, says how many made it in, and offers the book. The ones that
 * didn't fit are held, and buying adds them (see `bookCapDialog` on /print),
 * so nobody has to import their library twice.
 */
export function BookCapDialog({
  found,
  kept,
  freeRecipes,
  price,
  willAddRest,
  busy,
  onBuy,
  onClose,
}: {
  /** How many recipes arrived, and how many of them fit. */
  found: number;
  kept: number;
  /** The free preview's size. */
  freeRecipes: number;
  /** The cookbook's price as shown at checkout, e.g. "$15.99". */
  price: string;
  /** Buying adds the recipes that didn't fit, without importing them again. */
  willAddRest: boolean;
  busy: boolean;
  onBuy: () => void;
  onClose: () => void;
}) {
  const rest = found - kept;
  const recipes = (n: number) => `${n} recipe${n === 1 ? "" : "s"}`;
  // The book is full whenever this shows, so the title counts the book, not
  // this import: a book that already had recipes took fewer of these.
  const title = kept > 0 ? `Your first ${recipes(freeRecipes)} are in` : "Your free preview is full";
  return (
    <Dialog
      onClose={onClose}
      closeDisabled={busy}
      labelledBy="book-cap-dialog-title"
      className="fixed inset-0 z-[var(--z-dialog)] grid place-items-center dialog-scrim p-cp-4"
      panelClassName="relative w-full max-w-md rounded-2xl border border-line bg-card p-cp-6 shadow-cp-lg"
      portal
    >
      <IconButton className="absolute right-3 top-3" aria-label="Close" disabled={busy} onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </IconButton>
      <h2 id="book-cap-dialog-title" className="pr-10 text-cp-dialog-title font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-cp-3 flex flex-col gap-cp-3 text-cp-body leading-relaxed text-ink-soft">
        <p>
          A free preview holds {recipes(freeRecipes)}, so you can see how your cookbook looks before you buy it.
          {kept > 0 ? ` We added ${kept} of the ${found} you picked.` : ""}
        </p>
        <p>
          {willAddRest
            ? `Get the full cookbook and we'll add ${kept > 0 ? `the other ${rest}` : `these ${recipes(rest)}`} for you, with room for as many more as you like.`
            : `Get the full cookbook to add ${kept > 0 ? `the other ${rest}` : `these ${recipes(rest)}`}, with room for as many more as you like.`}
        </p>
      </div>
      <div className="mt-cp-6 flex flex-wrap justify-end gap-cp-3">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Keep previewing
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onBuy}>
          {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
          Get the full cookbook · {price}
        </button>
      </div>
    </Dialog>
  );
}
