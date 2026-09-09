import Link from "next/link";
import { FeatureRows } from "@/components/seo/LandingVisuals";
import { SectionHeading } from "@/components/seo/LandingFrame";

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
// ─────────────────────────────────────────────────────────────────────────

export function CookbookPitch({ heading }: { heading?: string }) {
  return (
    <section aria-labelledby="cookbook-pitch-heading">
      <div id="cookbook-pitch-heading">
        <SectionHeading>{heading ?? "When the stack becomes a book"}</SectionHeading>
      </div>
      <div className="mt-cp-6">
        <FeatureRows
          features={[
            {
              heading: "Bind the recipes you keep coming back to",
              image: "bound-cookbook",
              body:
                "Once enough recipes have earned a place, RecipePrinter sorts them into chapters, generates the cover, and builds the table of contents. Rearrange anything you want moved, then print it at home on US Letter or send the file to Lulu or Blurb for a hardcover or spiral bound cookbook. Each cookbook is its own one-off purchase.",
            },
          ]}
        />
      </div>
      <p className="mt-cp-5 text-ink-soft text-cp-body leading-relaxed">
        <Link href="/family-recipe-book" className="font-bold text-ink hover:underline">
          Family recipe book ideas
        </Link>{" "}
        walks through what goes in one and how people put them together.
      </p>
    </section>
  );
}
