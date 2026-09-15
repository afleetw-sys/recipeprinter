import Link from "next/link";
import { FeatureRows } from "@/components/seo/LandingVisuals";

// ─────────────────────────────────────────────────────────────────────────
// The cookbook, argued once, on the pages where it is the natural next step.
//
// It was mentioned on five of fifteen landing pages, and four of those are the
// preservation and gift pages where a book is the obvious ending anyway. The
// pages that print a stack of recipes and stop there — from a website, onto
// cards, into a binder, organized into collections — never raised it at all,
// which is where the person most likely to want one actually is.
//
// One shared section rather than a paragraph rewritten fifteen times: the
// claim is the same everywhere, and it should not drift page to page.
// Pages that already argue the cookbook at length (family-recipe-book,
// preserve-family-recipes, the comparison pages) leave `cookbookPitch` off.
//
// No section heading of its own — FeatureRows' own `heading` on the single
// row already reads as one, and a second title above it just repeated the
// same words a beat earlier for no reason. The section's accessible name
// comes from `aria-label` instead of an `aria-labelledby` id, since there is
// no longer a dedicated heading element to point one at.
// ─────────────────────────────────────────────────────────────────────────

export function CookbookPitch({ heading, body }: { heading?: string; body?: string }) {
  const resolvedHeading = heading ?? "When the stack becomes a book";
  return (
    <section aria-label={resolvedHeading}>
      <FeatureRows
        features={[
          {
            heading: resolvedHeading,
            image: "bound-cookbook",
            body: (
              <>
                {body ??
                  "Once enough recipes have earned a place, RecipePrinter sorts them into chapters, generates the cover, and builds the table of contents. Rearrange anything you want moved, then print it at home on US Letter or send the file to Lulu or Blurb for a hardcover or spiral bound cookbook. Each cookbook is its own one-off purchase."}{" "}
                <Link href="/family-recipe-book" className="font-bold text-ink hover:underline">
                  Family recipe book ideas
                </Link>{" "}
                walks through what goes in one and how people put them together.
              </>
            ),
          },
        ]}
      />
    </section>
  );
}
