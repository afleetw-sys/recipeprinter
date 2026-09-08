import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ICON_SIZE, PrintIcon } from "@/components/icons";

// ─────────────────────────────────────────────────────────────────────────
// The shared shell behind every page that isn't the printer itself: the SEO
// landing pages under /[slug], and the overview pages (/features,
// /how-it-works) that explain the product rather than target one search.
//
// It used to live inside app/[slug]/page.tsx, which meant the overview pages
// had no way to reach it and rendered through PageShell instead: a 720px
// article column with no hero, no section ladder, and its own card styling.
// Two pages on the same site that plainly weren't. Everything visual now
// comes from here, so "looks like the rest of the site" is the default rather
// than something each page re-derives.
// ─────────────────────────────────────────────────────────────────────────

/** Anchor for the in-page capture block on pages that carry one. */
export const CAPTURE_HREF = "#rp-capture";

export function LandingCta({
  label = "Start printing recipes",
  href = CAPTURE_HREF,
  variant = "primary",
  compact = false,
}: {
  label?: string;
  /** Defaults to this page's capture block. Overview pages have no capture
      block of their own, so they send the reader to the printer instead. */
  href?: string;
  variant?: "primary" | "secondary";
  /** Tighten padding/text on mobile so the header CTA fits inline with the
      wordmark and account button; full size returns at the `sm` breakpoint. */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}${
        compact ? " px-cp-3 text-cp-small sm:px-[18px] sm:text-cp-body" : ""
      }`}
    >
      <PrintIcon size={ICON_SIZE.md} />
      {label}
    </Link>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">{children}</h2>;
}

/**
 * A titled section on the ladder. Takes the id so the heading is what
 * `aria-labelledby` points at, which is the pattern the landing template
 * already used by hand at every call site.
 */
export function LandingSection({
  id,
  heading,
  lede,
  children,
}: {
  id: string;
  heading: ReactNode;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div id={id}>
        <SectionHeading>{heading}</SectionHeading>
      </div>
      {lede && (
        <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">{lede}</p>
      )}
      <div className="mt-cp-6">{children}</div>
    </section>
  );
}

/**
 * The two-column opener: words on the left, the product photo on the right.
 * `actions` is whatever belongs under the lede, a capture block on a utility
 * page, buttons on a page that explains before it asks.
 */
export function LandingHero({
  h1,
  lede,
  actions,
  note,
  aside,
  above,
  align = "split",
}: {
  h1: string;
  lede: string;
  actions?: ReactNode;
  note?: string;
  aside: ReactNode;
  /** Breadcrumb, or anything else that sits above the heading. */
  above?: ReactNode;
  /**
   * `split` sets the words against the photo, two columns. It reads as a pitch
   * with its proof beside it, which is what a page answering one search is.
   *
   * `centered` runs the words down the middle and the photo full width beneath.
   * An overview page is not arguing a single claim, so pinning its heading to
   * the left of a photo gives the photo a rebuttal it was never making. The
   * image still opens the page; it just stops being the other half of an
   * argument.
   */
  align?: "split" | "centered";
}) {
  const centered = align === "centered";
  return (
    <div className="flex flex-col gap-cp-6">
      {above}
      <section
        className={
          centered
            ? "flex flex-col gap-cp-7 py-cp-3"
            : "grid items-center gap-cp-7 py-cp-3 lg:grid-cols-2 lg:gap-[64px]"
        }
        aria-labelledby="landing-heading"
      >
        <div className={centered ? "flex flex-col items-center text-center" : undefined}>
          <h1
            id="landing-heading"
            className="text-cp-hero-lg font-extrabold leading-[1.04] tracking-[-0.04em]"
          >
            {h1}
          </h1>
          <p
            className={`mt-cp-4 max-w-[40rem] text-cp-body-lg leading-relaxed text-ink-soft${
              centered ? " mx-auto" : ""
            }`}
          >
            {lede}
          </p>
          {actions && <div className="mt-cp-5">{actions}</div>}
          {note && (
            <p
              className={
                centered
                  ? "mt-cp-5 max-w-[46rem] text-cp-small leading-relaxed text-ink-soft"
                  : "mt-cp-5 max-w-[40rem] border-l-2 border-line pl-cp-4 text-cp-small leading-relaxed text-ink-soft"
              }
            >
              {note}
            </p>
          )}
        </div>
        {/* Split gives the photo half the row, which caps it on its own. Centred
            it has the full content width to grow into, and at 860 the opening
            ran past the fold on a laptop and pushed the first section off the
            screen entirely. The image still opens the page; it just stops being
            the only thing on it. */}
        {centered ? <div className="mx-auto w-full max-w-[640px]">{aside}</div> : aside}
      </section>
    </div>
  );
}

/**
 * Page chrome plus the section ladder.
 *
 * The vertical rhythm is a three-step ladder, and each rung has to clear the
 * one below it or the grouping stops being readable: 32px between a feature
 * row's copy and its own image, 56px between one feature row and the next
 * (see FeatureRows), and 96px here between whole sections. At the old 72px a
 * section break was only 16px more than a row break, so "new section" and
 * "next row in this section" looked nearly alike. Mobile steps the whole
 * ladder down to 20 / 40 / 72.
 */
export function LandingFrame({
  headerActions,
  children,
}: {
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader actions={headerActions} />
      <main className="flex-1 px-cp-6 sm:px-cp-7 lg:px-[40px]">
        <div className="max-w-content mx-auto flex flex-col gap-[72px] lg:gap-[96px] pt-cp-5 pb-[80px]">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
