

// Remote recipe photos deliberately bypass next/image (raw <img>, since the
// optimizer can't run against unpredictable third-party hosts) — don't add a
// wildcard remotePatterns here, it'd turn the Image Optimization endpoint
// into an open proxy for any HTTPS URL the moment something does use <Image>.
const nextConfig = {};

export default nextConfig;
