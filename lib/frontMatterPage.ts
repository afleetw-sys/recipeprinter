import type { CookbookFrontMatter, CoverConfig, RecipePrintTemplate } from "@/types/recipe";

/**
 * The book's opening page, from whichever field holds it.
 *
 * There are two, for historical reasons. `dedication` is a `CoverConfig` — the
 * original shape, a cover page that happens to sit inside the book. It was
 * joined by `frontMatter`, a `{ kind, heading, body }` record that the opening
 * page editor writes, and which can say "Introduction" as well as "Dedication".
 * Both persist, and either may be the one holding the page.
 *
 * This function is the single answer to "what is the opening page", and it
 * exists because the preview and the export each had their own. The preview
 * read `frontMatter` first and fell back to `dedication`; the export read
 * `dedication` alone. So a page written in the opening-page editor appeared on
 * screen and was missing from the PDF — and, worse than missing, it took the
 * page count with it: front-matter length decides whether an opening blank is
 * inserted for parity, so losing the page could also flip a blank INTO the
 * file. The download showed a blank leaf where the page the cook had just
 * written should have been.
 *
 * One derivation, imported by both, so the two cannot drift again.
 */
export function openingPageFor({
  frontMatter,
  dedication,
  template,
}: {
  frontMatter?: CookbookFrontMatter;
  dedication?: CoverConfig;
  template: RecipePrintTemplate;
}): CoverConfig | undefined {
  if (frontMatter && (frontMatter.heading?.trim() || frontMatter.body?.trim())) {
    return {
      title:
        frontMatter.heading?.trim() ||
        (frontMatter.kind === "dedication" ? "Dedication" : "Introduction"),
      blurb: frontMatter.body,
      template,
    };
  }
  return dedication;
}
