import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

// A branded 1200x630 social card, generated at request time. Using next/og
// keeps it in sync with the product name/tagline and avoids shipping a binary
// asset. Next serves this for both og:image and (as a fallback) twitter:image
// on every route that doesn't set its own — including on-demand routes like
// /[slug] and /print/[slug], which are never statically prerendered, so this
// module gets imported fresh in Vercel's serverless function on every such
// request. The logo is read from a copy co-located with this route (rather
// than `public/images/recipeprinter-logo.png`) because `public/` is served
// straight from Vercel's CDN and is NOT included in the serverless function's
// filesystem at all — reading it with fs.readFileSync threw ENOENT in
// production (though it worked fine locally, where the whole repo is on
// disk), which took down every dynamic route on the site, not just this
// image. Next's build tracing does bundle files under app/ that are read this
// way, so this co-located copy resolves correctly at runtime.
const logoData = readFileSync(join(process.cwd(), "app/opengraph-image-logo.png"));
const logoUrl = `data:image/png;base64,${logoData.toString("base64")}`;

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          // Darkened teal so the white card text stays legible (vivid #60CAC4
          // would only hit ~1.95:1 against white).
          background: "linear-gradient(135deg, #2f7d78 0%, #1f6b66 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
            marginBottom: "44px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "104px",
              height: "104px",
              borderRadius: "26px",
              background: "rgba(255,255,255,0.16)",
              border: "2px solid rgba(255,255,255,0.5)",
            }}
          >
            <img
              src={logoUrl}
              alt=""
              width="82"
              height="82"
              style={{
                objectFit: "contain",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: "52px", fontWeight: 800, letterSpacing: "0" }}>
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "76px",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "0",
            maxWidth: "900px",
          }}
        >
          Print the recipes worth making again.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "32px",
            fontSize: "34px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.92)",
            maxWidth: "920px",
          }}
        >
          Turn web and social recipe links into printable recipe cards and PDFs.
        </div>
      </div>
    ),
    { ...size },
  );
}
