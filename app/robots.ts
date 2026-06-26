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
      disallow: ["/print", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
