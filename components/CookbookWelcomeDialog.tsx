"use client";

import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";

export function CookbookWelcomeDialog({
  open,
  cover,
  price,
  purchased = false,
  empty = false,
  onStart,
  onClose,
}: {
  open: boolean;
  cover: CoverConfig;
  price: string;
  /**
   * This project's cookbook is already paid for — the cook switched to recipe
   * cards and is on their way back in. Every entry into a book goes through
   * this screen (one path, always, with the build reveal after it), so without
   * this it quoted $19.99 at someone who had already paid it, which is the
   * single loudest way to suggest their purchase didn't survive.
   */
  purchased?: boolean;
  /** The book has no recipes yet — a cook may start one from nothing. */
  empty?: boolean;
  onStart: () => void;
  /** Dismiss and stay in the book: the X, Escape and the backdrop. */
  onClose: () => void;
}) {
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
        {/* next/image, not a raw <img>: the source is a 2.4 MB PNG and this
            dialog only mounts when it opens, so a raw tag started that download
            at the exact moment the cook is being asked to pay — an empty panel
            on any connection that isn't fast. Served through the optimizer it
            arrives as WebP/AVIF at the ~460px the panel actually shows.
            `sizes` matches the panel's own breakpoint (see
            `.cookbook-welcome__panel` in globals.css); `priority` because it's
            in view the instant it mounts, so the default lazy load would just
            add a beat. The existing `width/height/object-fit` CSS still drives
            the layout — the width/height props are only the intrinsic ratio. */}
        <Image
          src="/images/cookbook-onboarding-hero.jpg"
          alt=""
          width={1536}
          height={1024}
          sizes="(max-width: 720px) 100vw, 460px"
          priority
        />
      </div>
      <div className="cookbook-welcome__copy">
        <div className="cookbook-welcome__lede">
          {/* This screen now opens ON TOP of the built book rather than in
              front of the idea of one, so it describes what is already on the
              screen behind it. */}
          <h2 id="cookbook-welcome-title">
            {purchased
              ? "Your cookbook is right where you left it."
              : "Your cookbook is built."}
          </h2>
          <p>
            {purchased
              ? "Your cover, chapters and layout are all still here."
              : empty
                ? "A cover and pages are ready behind this. Add recipes whenever you like, and change anything on it."
                : "Your recipes are laid out behind this, with a cover and chapters. Everything on it is yours to change."}
          </p>
        </div>
        <ul className="cookbook-feature-chips">
          {[
            "A cover, chapters and a table of contents, made for you",
            "Your own photo on the cover, and on any recipe page",
            "A print-ready PDF for spiral or hardcover binding",
          ].map((item) => (
            <li key={item}><CheckIcon size={ICON_SIZE.sm} />{item}</li>
          ))}
        </ul>
        <div className="cookbook-welcome__price">
          {purchased ? (
            <span className="cookbook-welcome__owned">
              <CheckIcon size={ICON_SIZE.sm} />
              You own this cookbook. Export it as often as you like.
            </span>
          ) : (
            <>
              <b>{price}</b>
              <span>Paid once, the first time you export this cookbook. Editing it is free until then.</span>
            </>
          )}
        </div>
        <div className="cookbook-welcome__actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {purchased ? "Open my cookbook" : "Start editing"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
