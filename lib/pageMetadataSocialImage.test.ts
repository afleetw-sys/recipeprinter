import { describe, expect, it } from "vitest";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES, seoLandingPageMetadata } from "@/lib/seoLandingPages";

// app/opengraph-image.tsx is meant to be the preview on every route that does
// not set its own. It only ever reached the homepage: Next replaces a parent's
// `openGraph` and `twitter` wholesale when a page sets its own, so every page
// built with pageMetadata() dropped the image and fell back to the small
// "summary" card. A page that sets those blocks has to carry the image itself.
function imageCount(images: unknown): number {
  if (!images) return 0;
  return Array.isArray(images) ? images.length : 1;
}

function expectSocialImage(metadata: Metadata) {
  expect(imageCount(metadata.openGraph?.images)).toBeGreaterThan(0);
  expect(imageCount(metadata.twitter?.images)).toBeGreaterThan(0);
  expect((metadata.twitter as { card?: string } | undefined)?.card).toBe("summary_large_image");
}

describe("every public page shares with a preview image", () => {
  it("pageMetadata()", () => {
    expectSocialImage(pageMetadata({ title: "Title", description: "Description", path: "/path" }));
  });

  it.each(SEO_LANDING_PAGES.map((page) => page.slug))("/%s", (slug) => {
    const page = SEO_LANDING_PAGES.find((candidate) => candidate.slug === slug)!;
    expectSocialImage(seoLandingPageMetadata(page));
  });
});
