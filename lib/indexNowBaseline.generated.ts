// Overwritten during production builds by scripts/indexnow-baseline.mjs with
// the sitemap that was live just before the build (url → lastmod). Committed
// as null so local, preview and CI builds compile and submit nothing.
export const PREVIOUS_SITEMAP: Record<string, string> | null = null;
