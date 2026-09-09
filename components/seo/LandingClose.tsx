import type { ReactNode } from "react";
import { LandingCta } from "@/components/seo/LandingFrame";

/**
 * The end of the page: a rule, the button, and whatever footnote belongs with
 * it.
 *
 * The button used to be a bare child of the section ladder, which gave it the
 * full 96px a titled section gets without it being one, and anything after it
 * got the same again. Two things left at the bottom of the page rather than an
 * ending. Grouped here they read as one, and the rule above is the only one on
 * the page, which is what makes it a close rather than another divider.
 */
export function LandingClose({
  label = "Start printing for free",
  href = "/",
  centered = false,
  children,
}: {
  label?: string;
  href?: string;
  /**
   * Sit the close in the same centred reading column its page's body uses.
   *
   * Every other page fills the full 1240 with cards or rows, so its close
   * starts at the left edge and lines up with everything above it. A page that
   * is nothing but prose does not fill that width, and a close pinned to the
   * far left of a centred column of text is not the end of anything.
   */
  centered?: boolean;
  /** A footnote that belongs with the button, not a section of its own. */
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-start gap-cp-5 border-t border-line pt-cp-7${
        centered ? " mx-auto w-full max-w-[46rem]" : ""
      }`}
    >
      <LandingCta href={href} label={label} />
      {children}
    </div>
  );
}
