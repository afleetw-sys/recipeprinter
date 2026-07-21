

// Remote recipe photos deliberately bypass next/image (raw <img>, since the
// optimizer can't run against unpredictable third-party hosts) — don't add a
// wildcard remotePatterns here, it'd turn the Image Optimization endpoint
// into an open proxy for any HTTPS URL the moment something does use <Image>.
const nextConfig = {
  // Allows an isolated build dir (e.g. when a second dev server is running
  // against this checkout) via NEXT_DIST_DIR. Defaults to .next, so prod and
  // normal local dev are unaffected.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  // PostHog's ingest endpoints proxied under our own origin. Requests to
  // *.posthog.com are on every ad blocker's list, which would silently drop a
  // slice of real traffic — and skew it, since the people running blockers
  // aren't a random sample. Paired with `api_host: "/ingest"` in lib/analytics.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // PostHog's API is trailing-slash sensitive; Next's default redirect breaks it.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
