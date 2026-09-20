

// Remote recipe photos deliberately bypass next/image (raw <img>, since the
// optimizer can't run against unpredictable third-party hosts) — don't add a
// wildcard remotePatterns here, it'd turn the Image Optimization endpoint
// into an open proxy for any HTTPS URL the moment something does use <Image>.
// Firebase Auth's sign-in helper pages (`/__/auth/handler`, `/__/auth/iframe`),
// served from OUR origin.
//
// Firebase's default is to serve them from `<project>.firebaseapp.com`, which is a
// different site from ours. Safari 16.1+, Firefox 109+ and Chrome 115+ block the
// third-party storage that redirect sign-in reads its result back through, so for
// an app hosted outside Firebase Hosting a redirect sign-in returns the visitor
// signed out with no error. Serving these pages under our own domain makes that
// storage first-party. Firebase's own guidance for this setup (a reverse proxy
// that forwards transparently, not a redirect):
// https://firebase.google.com/docs/auth/web/redirect-best-practices
//
// This does nothing until `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is set to the host
// people sign in on (www.recipeprinter.com) AND that host's
// `https://www.recipeprinter.com/__/auth/handler` is added as an authorized
// redirect URI for the Google and Apple sign-in providers, in that order.
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseAuthProxy = firebaseProjectId
  ? [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseProjectId}.firebaseapp.com/__/auth/:path*`,
      },
    ]
  : [];

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
      ...firebaseAuthProxy,
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
  // Retired SEO pages. A landing page that gets folded into a stronger one
  // keeps its URL working and passes its ranking on, rather than 404ing and
  // dropping whatever it had earned. Permanent, because these are not coming
  // back: the page was removed from SEO_LANDING_PAGES, so the route and the
  // sitemap entry are already gone.
  async redirects() {
    return [
      {
        // "Print recipe from a URL" and "print recipe from a website" are the
        // same job, and two pages split the signal for it. The website page
        // had the depth, so it absorbed the URL phrasing and this one folded
        // into it.
        source: "/print-recipe-from-url",
        destination: "/print-recipe-from-website",
        permanent: true,
      },
      {
        // Same page, renamed to the phrase it was already ranking for —
        // "recipe card printer" is what people search, and the old slug
        // ("printable recipe card generator") never appeared anywhere on
        // the page except in the URL itself once the title changed to match.
        source: "/printable-recipe-card-generator",
        destination: "/recipe-card-printer",
        permanent: true,
      },
    ];
  },

  // PostHog's API is trailing-slash sensitive; Next's default redirect breaks it.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
