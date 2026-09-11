import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

// The marketing/product surface (the homepage) should be crawled. The print
// preview and API are per-session, JS-driven utilities with no standalone
// indexable content, so we keep them out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/print$", "/print?", "/api/"],
    },
    // Two sitemaps, which the protocol allows: the pages, and the
    // photographs on them. The images need their own because they are
    // lazy-loaded and served through the image optimizer, so a crawler
    // reading the markup sees no path ending in .jpeg to follow.
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/image-sitemap.xml")],
    host: absoluteUrl("/"),
  };
}
