import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

// A branded 1200×630 social card, generated at build time. Using next/og keeps
// it in sync with the product name/tagline and avoids shipping a binary asset.
// Next serves this for both og:image and (as a fallback) twitter:image.

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
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
          background: "linear-gradient(135deg, #009bfa 0%, #60cac4 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Printer glyph in a rounded card, echoing the app logo mark */}
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
              fontSize: "60px",
            }}
          >
            🖨️
          </div>
          <div style={{ display: "flex", fontSize: "52px", fontWeight: 800, letterSpacing: "-2px" }}>
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "76px",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-3px",
            maxWidth: "900px",
          }}
        >
          Print any recipe without the clutter.
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
          Paste a URL, photo, or text — get a clean, printable recipe with no ads. Save as PDF.
        </div>
      </div>
    ),
    { ...size },
  );
}
