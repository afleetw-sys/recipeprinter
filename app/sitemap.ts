import type { MetadataRoute } from "next";
import { absoluteUrl, NAV_LINKS } from "@/lib/seo";

// Honest per-page last-modified dates (YYYY-MM-DD). Search engines treat
// <lastmod> as a recrawl hint, so it has to be truthful: bump a page's date
// only when its content meaningfully changes. (Regenerating `new Date()` on
// every request made every page look freshly edited at all times, which Google
// learns to discount.) New routes default to the most recent site-wide update.
const LAST_MODIFIED: Record<string, string> = {
  "/": "2026-06-30",
  "/how-it-works": "2026-06-30",
  "/features": "2026-06-30",
  "/faq": "2026-06-30",
  "/about": "2026-06-30",
};

const DEFAULT_LAST_MODIFIED = "2026-06-30";

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
];

export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified: LAST_MODIFIED[path] ?? DEFAULT_LAST_MODIFIED,
    changeFrequency,
    priority,
  }));
}
