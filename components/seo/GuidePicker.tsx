import Link from "next/link";
import { anchorFor, type SeoLandingPage } from "@/lib/seoLandingPages";

// ─────────────────────────────────────────────────────────────────────────
// A picker, not a link list, and not another card grid.
//
// These first rendered as the pages' own titles, so a reader asking "how did I
// find this recipe?" got ten cards mostly beginning "Print a recipe from…" and
// had to read each one to the end to find the word that differed. Leading with
// the platform fixed the scanning, but keeping the phrase underneath just said
// the same thing twice: "Pinterest" over "Print Pinterest recipes".
//
// So the label is the whole card, and the card is a chip. This is the same
// wrapped row of compact buttons the landing template already uses for its
// related links, which means the page carries one navigation pattern instead
// of a bespoke grid of its own.
//
// The trade: the link text is now "Pinterest" rather than "Print Pinterest
// recipes", so it carries less of the target phrase. The section heading above
// it and the destination's own h1 both still say it, and a card that repeats
// itself is a worse trade to make in the other direction.
// ─────────────────────────────────────────────────────────────────────────

export function GuidePicker({
  pages,
  labelBy = "short",
}: {
  pages: SeoLandingPage[];
  /**
   * Which name a chip wears, because the two contexts want opposite things.
   *
   * A picker asks a question the chip answers, so "Where did you find the
   * recipe?" is followed by Pinterest, and repeating "Print Pinterest recipes"
   * there would just say the question back.
   *
   * "Read more" is not a question. It promises a page, so the chip has to name
   * the page: "Read more → A website or blog" does not parse, and "Read more →
   * Print a recipe from a website" does.
   */
  labelBy?: "short" | "anchor";
}) {
  return (
    <div className="flex flex-wrap gap-cp-3">
      {pages.map((page) => (
        <Link
          key={page.slug}
          href={`/${page.slug}`}
          className="btn btn-secondary btn-compact"
        >
          {labelBy === "anchor" ? anchorFor(page) : page.shortLabel ?? anchorFor(page)}
        </Link>
      ))}
    </div>
  );
}
