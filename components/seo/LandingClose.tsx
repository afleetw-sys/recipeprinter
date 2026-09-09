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
  children,
}: {
  label?: string;
  href?: string;
  /** A footnote that belongs with the button, not a section of its own. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-cp-5 border-t border-line pt-cp-7">
      <LandingCta href={href} label={label} />
      {children}
    </div>
  );
}
