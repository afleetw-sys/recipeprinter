"use client";

import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";

export function CookbookMockup({ cover, compact = false }: { cover: CoverConfig; compact?: boolean }) {
  const images = cover.gridImages?.length ? cover.gridImages : cover.imageUrl ? [cover.imageUrl] : [];
  return (
    <div className={`cookbook-mockup ${compact ? "cookbook-mockup--compact" : ""}`} aria-hidden>
      <div className="cookbook-mockup__book">
        <div className="cookbook-mockup__spine" />
        <div className={`cookbook-mockup__cover cookbook-mockup__cover--${cover.layout ?? "typographic"}`}>
          <div className="cookbook-mockup__images">
            {images.slice(0, 4).map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" key={`${src}-${index}`} />
            ))}
          </div>
          <div className="cookbook-mockup__shade" />
          <div className="cookbook-mockup__type">
            {cover.subtitle && <span>{cover.subtitle}</span>}
            <strong>{cover.title || "My Cookbook"}</strong>
            {cover.author && <small>{cover.creditLabel === "compiled-by" ? "Compiled by " : ""}{cover.author}</small>}
          </div>
        </div>
        <div className="cookbook-mockup__pages" />
      </div>
    </div>
  );
}

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/cookbook-onboarding-hero.png" alt="" />
      </div>
      <div className="cookbook-welcome__copy">
        <div className="cookbook-welcome__lede">
          <h2 id="cookbook-welcome-title">Your recipes, made into a cookbook worth keeping.</h2>
          <p>Not just a PDF&mdash;a professionally designed keepsake you&apos;ll be proud to print, gift, and pass down.</p>
        </div>
        <ul className="cookbook-feature-chips">
          {["Looks professionally printed", "Automatically organized", "Ready for hardcover or spiral printing"].map((item) => (
            <li key={item}><CheckIcon size={ICON_SIZE.sm} />{item}</li>
          ))}
        </ul>
        <div className="cookbook-welcome__price">
          <strong>This cookbook is yours forever.</strong>
          <span>Edit it, add recipes, and export updated versions anytime.</span>
          <b>{price} per cookbook</b>
          <span>You&apos;re only charged when you export.</span>
        </div>
        <div className="cookbook-welcome__actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>Create my cookbook</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Not now</button>
        </div>
      </div>
    </Dialog>
  );
}

export function CookbookBuildReveal({
  open,
  cover,
}: {
  open: boolean;
  cover: CoverConfig;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      closeDisabled
      label="Building your cookbook"
      className="cookbook-build-reveal no-print"
      portal
    >
      <div className="cookbook-build-reveal__glow" aria-hidden />
      <div className="cookbook-build-reveal__content">
        <CookbookMockup cover={cover} compact />
        <div className="cookbook-build-reveal__copy">
          <span>Bringing your recipes together</span>
          <strong>Creating your cookbook…</strong>
          <div className="cookbook-build-reveal__progress" aria-hidden><i /></div>
        </div>
      </div>
    </Dialog>
  );
}
