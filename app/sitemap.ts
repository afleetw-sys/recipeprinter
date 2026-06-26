import type { MetadataRoute } from "next";
import { absoluteUrl, NAV_LINKS } from "@/lib/seo";

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
  const now = new Date();
  return staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
