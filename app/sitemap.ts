import type { MetadataRoute } from "next";
import { absoluteUrl, NAV_LINKS } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

// Honest per-page last-modified dates (YYYY-MM-DD). Search engines treat
// <lastmod> as a recrawl hint, so it has to be truthful: bump a page's date
// only when its content meaningfully changes. (Regenerating `new Date()` on
// every request made every page look freshly edited at all times, which Google
// learns to discount.) New routes default to the most recent site-wide update.
const LAST_MODIFIED: Record<string, string> = {
  "/": "2026-07-02",
  "/how-it-works": "2026-07-02",
  "/features": "2026-07-02",
  "/faq": "2026-07-02",
  "/about": "2026-07-02",
};

const DEFAULT_LAST_MODIFIED = "2026-07-02";

// Static, indexable routes. The supporting pages come straight from NAV_LINKS so
// the sitemap and the site navigation can never drift apart. When public recipe
// pages (e.g. /recipes/[slug]) land later, map them in here too, the canonical
// origin comes from lib/seo, so no redesign is needed.
const staticRoutes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  ...NAV_LINKS.map((link) => ({
    path: link.href,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  })),
  ...SEO_LANDING_PAGES.map((page) => ({
    path: `/${page.slug}`,
    priority: page.intent === "Utility SEO" ? 0.85 : 0.75,
    changeFrequency: "monthly" as const,
  })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified: LAST_MODIFIED[path] ?? DEFAULT_LAST_MODIFIED,
    changeFrequency,
    priority,
  }));
}
