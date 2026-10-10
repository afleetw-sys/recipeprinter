/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/seo";
import { SEO_LANDING_PAGES, seoLandingPageMetadata } from "@/lib/seoLandingPages";

/**
 * What the browser tab and search result actually show. app/layout.tsx wraps a
 * plain string title in `%s · RecipePrinter`; `{ absolute }` skips the wrapper.
 */
function renderedTitle(title: unknown): string {
  if (typeof title === "string") return `${title} · ${SITE_NAME}`;
  if (title && typeof title === "object" && "absolute" in title) {
    return String((title as { absolute: string }).absolute);
  }
  throw new Error(`Unexpected title shape: ${JSON.stringify(title)}`);
}

function countSiteName(text: string): number {
  return text.split(SITE_NAME).length - 1;
}

describe("SEO landing page titles", () => {
  // A page whose own title already ends "| RecipePrinter" got the layout's
  // "· RecipePrinter" on top whenever someone forgot to add its slug to a
  // hand-kept list, which is how /christmas-recipe-book shipped doubled.
  for (const page of SEO_LANDING_PAGES) {
    it(`/${page.slug} names RecipePrinter exactly once`, () => {
      const metadata = seoLandingPageMetadata(page);
      expect(countSiteName(renderedTitle(metadata.title))).toBe(1);
      expect(countSiteName(String(metadata.openGraph?.title))).toBe(1);
      expect(countSiteName(String(metadata.twitter?.title))).toBe(1);
    });
  }
});

// The hand-written pages get the same template and the same trap: /pricing
// shipped as "RecipePrinter Pricing: … · RecipePrinter". A glob, so a page
// added later is held to it without anyone remembering this list exists.
const staticPages = import.meta.glob<{ metadata?: Metadata }>("../app/*/page.tsx");

describe("static page titles", () => {
  it.each(Object.keys(staticPages))("%s names RecipePrinter exactly once", async (file) => {
    const metadata = (await staticPages[file]()).metadata;
    if (!metadata?.title) return; // inherits the root layout's title
    expect(countSiteName(renderedTitle(metadata.title))).toBe(1);
    expect(countSiteName(String(metadata.openGraph?.title))).toBe(1);
    expect(countSiteName(String(metadata.twitter?.title))).toBe(1);
  });
});
