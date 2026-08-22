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
      // `/projects` and everything under it is one person's private work.
      // `/print/<slug>` is deliberately NOT listed: it is the public share
      // link, and untangling it from the private workspace is half the
      // reason the workspace moved off that prefix.
      disallow: ["/projects", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
