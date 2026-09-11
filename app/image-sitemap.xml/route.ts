import { absoluteUrl } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";
import { featureCardImages, homeImages, landingPageImages } from "@/lib/seoImages";
import { IMPORT_CARDS, POINTS, PRINT_CARDS, YOURS_CARDS } from "@/lib/seoFeatureCards";

// /image-sitemap.xml — the photographs, page by page.
//
// Separate from sitemap.ts because Next 14's MetadataRoute.Sitemap has no
// `images` field (it arrived in 15), so the image namespace has to be written
// out by hand. robots.ts lists both, which is what the sitemaps protocol
// expects: a site may declare as many sitemaps as it likes.
//
// Only <image:loc> is emitted. Google used to read <image:title>, <image:caption>
// and <image:license> and now ignores all three, so writing them would be
// decoration. The alt text that actually describes each photo lives in the
// markup, which is where Google reads it from.
export const dynamic = "force-static";

/** XML text escaping. Our paths are plain today; a filename with & would not be. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urlEntry(path: string, images: string[]): string {
  const tags = images
    .map((src) => `    <image:image><image:loc>${xml(absoluteUrl(src))}</image:loc></image:image>`)
    .join("\n");
  return `  <url>\n    <loc>${xml(absoluteUrl(path))}</loc>\n${tags}\n  </url>`;
}

export function GET() {
  const entries = [
    { path: "/", images: homeImages() },
    ...SEO_LANDING_PAGES.map((page) => ({
      path: `/${page.slug}`,
      images: landingPageImages(page),
    })),
    // The two supporting pages that carry photography. Their card runs are
    // exported from the pages themselves rather than copied here, so a card
    // that gains or loses its image follows without anyone remembering to.
    { path: "/features", images: featureCardImages(PRINT_CARDS, IMPORT_CARDS, YOURS_CARDS) },
    { path: "/how-it-works", images: featureCardImages(POINTS) },
    // Anything else on the site is chrome (the logo, the Buy Me a Coffee mark)
    // or has no photography at all, and an empty <url> helps nobody.
  ].filter((entry) => entry.images.length > 0);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((entry) => urlEntry(entry.path, entry.images)).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
