"use client";

import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";
import { useVisitorPrices } from "@/lib/visitorCurrency";
import { FREE_COOKBOOK_RECIPES, IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";

const COOKBOOK_STEPS = [
  "Add your recipes",
  "Sort them into chapters",
  "Edit pages and add your photos",
  "Pick a theme, then download it to print anywhere",
] as const;

// The cookbook's own rule, stated before the first recipe so the cap is never
// a surprise. "Preview" (free) is always paired with what the purchase adds:
// a cookbook is never "free up to 10 recipes" on its own.
const PREVIEW_RULE = IMPORT_ALLOWANCE_LIVE
  ? `Free to preview with up to ${FREE_COOKBOOK_RECIPES} recipes. Buy to download or add more.`
  : "Pay when you download.";

export function CookbookWelcomeDialog({
  open,
  cover,
  price,
  fullPrice,
  hasRecipes,
  onStart,
  onLookAround,
  onClose,
}: {
  open: boolean;
  cover: CoverConfig;
  price: string;
  /** The regular price, when `price` is the Pro first-cookbook discount. Shown
      struck through first so $15.99 reads as a perk on this book, not as what
      a cookbook costs. */
  fullPrice?: string;
  /** The book already holds a recipe (one still importing counts): the cook
      got here by importing from the homepage, so `onStart` shows them the book
      instead of asking for a first recipe, and the button says so. */
  hasRecipes: boolean;
  onStart: () => void;
  /** Close onto the empty book without opening Add recipes. */
  onLookAround: () => void;
  /** Dismiss and stay in the book: the X, Escape and the backdrop. */
  onClose: () => void;
}) {
  const { label: local } = useVisitorPrices();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="cookbook-welcome-title"
      className="cookbook-welcome no-print"
      backdropClassName="cookbook-welcome__backdrop"
      panelClassName="cookbook-welcome__panel"
      portal
    >
      <button type="button" className="cookbook-welcome__close icon-close-btn" aria-label="Close" onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      <div className="cookbook-welcome__visual" aria-hidden>
        {/* next/image, not a raw <img>: the source is a full-size photo and
            this dialog only mounts when it opens, so a raw tag started that download
            at the exact moment the cook is being asked to pay — an empty panel
            on any connection that isn't fast. Served through the optimizer it
            arrives as WebP/AVIF at the ~460px the panel actually shows.
            `sizes` matches the panel's own breakpoint (see
            `.cookbook-welcome__panel` in globals.css); `priority` because it's
            in view the instant it mounts, so the default lazy load would just
            add a beat. The existing `width/height/object-fit` CSS still drives
            the layout — the width/height props are only the intrinsic ratio. */}
        <Image
          src="/images/cookbook-welcome-souvlaki.jpg"
          alt=""
          width={1333}
          height={2000}
          sizes="(max-width: 720px) 100vw, 460px"
          priority
        />
      </div>
      <div className="cookbook-welcome__copy">
        <div className="cookbook-welcome__lede">
          <h2 id="cookbook-welcome-title">Let’s make your cookbook.</h2>
          <p>We’ll handle the layout, contents and page numbers.</p>
        </div>
        {/* What to do next, not just what's included. The book is empty at
            this point, so it is an order of work, and the lede says which
            parts look after themselves. */}
        <ol className="cookbook-welcome__steps">
          {COOKBOOK_STEPS.map((step, index) => (
            <li key={step}>
              <span className="cookbook-welcome__step-num" aria-hidden>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <div className="cookbook-welcome__price">
          {fullPrice && fullPrice !== price ? (
            <>
              <b>
                <s className="cookbook-welcome__was">
                  <span className="sr-only">Was </span>
                  {local(fullPrice)}
                </s>{" "}
                <span className="sr-only">now </span>
                {local(price)} one time
              </b>
              <span>20% off your first cookbook with Pro. {PREVIEW_RULE}</span>
            </>
          ) : (
            <>
              <b>{local(price)} one time</b>
              <span>{PREVIEW_RULE}</span>
            </>
          )}
        </div>
        <div className="cookbook-welcome__actions">
          {/* An empty book can be looked over before anything goes in it: the
              way out, left of the way forward. A book that already has a
              recipe needs no second door, since its main button already just
              shows the book ("Take a look"). */}
          {!hasRecipes && (
            <button type="button" className="btn btn-secondary" onClick={onLookAround}>
              Look around first
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {hasRecipes ? "Take a look" : "Start adding recipes"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
