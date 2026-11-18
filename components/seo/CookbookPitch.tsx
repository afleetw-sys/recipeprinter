import Link from "next/link";
import type { ComponentProps } from "react";
import type { FeatureRows } from "@/components/seo/LandingVisuals";

// ─────────────────────────────────────────────────────────────────────────
// The cookbook, argued once, on the pages where it is the natural next step.
//
// It was mentioned on five of fifteen landing pages, and four of those are the
// preservation and gift pages where a book is the obvious ending anyway. The
// pages that print a stack of recipes and stop there — from a website, onto
// cards, into a binder, organized into collections — never raised it at all,
// which is where the person most likely to want one actually is.
//
// One shared row rather than a paragraph rewritten fifteen times: the claim is
// the same everywhere, and it should not drift page to page. Pages that
// already argue the cookbook at length (family-recipe-book,
// preserve-family-recipes, the comparison pages) leave `cookbookPitch` off.
//
// A row appended to the page's own feature rows, not a section of its own. As
// its own single-row FeatureRows it always restarted the left/right pattern,
// so it could land on the same side as the row above it and read as a stray
// block after the features rather than the last of them.
// ─────────────────────────────────────────────────────────────────────────

type FeatureRow = ComponentProps<typeof FeatureRows>["features"][number];

export function cookbookPitchFeature({
  heading,
  body,
  link,
}: {
  heading?: string;
  body?: string;
  /** Links a phrase inside `body` instead of appending the shared "online
      cookbook maker" sentence. */
  link?: { phrase: string; href: string };
}): FeatureRow {
  const resolvedHeading = heading ?? "When the stack becomes a book";
  const at = body && link ? body.indexOf(link.phrase) : -1;
  if (body && link && at >= 0) {
    return {
      heading: resolvedHeading,
      image: "bound-cookbook",
      body: (
        <>
          {body.slice(0, at)}
          <Link href={link.href} className="font-bold text-ink hover:underline">
            {link.phrase}
          </Link>
          {body.slice(at + link.phrase.length)}
        </>
      ),
    };
  }
  return {
    heading: resolvedHeading,
    image: "bound-cookbook",
    body: (
      <>
        {body ??
          "Once enough recipes have earned a place, add them to a cookbook. Sort them into chapters and choose a cover, and RecipePrinter builds the table of contents and page numbers as you go. Preview up to 10 recipes free; buying that cookbook lets you download or print it and add more recipes."}{" "}
        {/* To the tool page, in the words people search. This row is on nine
            utility pages, and it pointed at /family-recipe-book, which made
            that guide the site's most-linked cookbook page while the page
            meant to rank for "cookbook maker" got the fewest links. */}
        Start one with the{" "}
        <Link href="/cookbook-maker" className="font-bold text-ink hover:underline">
          online cookbook maker
        </Link>
        .
      </>
    ),
  };
}
