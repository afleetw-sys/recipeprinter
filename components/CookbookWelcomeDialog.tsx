"use client";

import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";

export function CookbookWelcomeDialog({
  open,
  cover,
  price,
  onStart,
  onClose,
}: {
  open: boolean;
  cover: CoverConfig;
  price: string;
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
          <h2 id="cookbook-welcome-title">Your cookbook is ready for recipes.</h2>
          <p>Add recipes, photos, and make changes anytime. You won’t pay until you’re ready to export.</p>
        </div>
        <div className="cookbook-welcome__price">
          <b>{price} one time</b>
          <span>Export a print-ready PDF, then keep editing and re-exporting this cookbook at no extra cost.</span>
        </div>
        <div className="cookbook-welcome__actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Start adding recipes
          </button>
        </div>
      </div>
    </Dialog>
  );
}
