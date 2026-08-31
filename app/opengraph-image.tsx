import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";
import { OPENGRAPH_IMAGE_LOGO_BASE64 } from "@/app/opengraph-image-logo-base64";
import {
  OPENGRAPH_KARLA_EXTRABOLD_BASE64,
  OPENGRAPH_KARLA_REGULAR_BASE64,
} from "@/app/opengraph-image-karla-base64";
import { OPENGRAPH_CARD_BASE64 } from "@/app/opengraph-image-card-base64";

// A branded 1200x630 social card, generated at request time. Using next/og
// keeps it in sync with the product name/tagline and avoids shipping a binary
// asset. Next serves this for both og:image and (as a fallback) twitter:image
// on every route that doesn't set its own — including on-demand routes like
// /[slug] and /print/[slug], which are never statically prerendered, so this
// module gets imported fresh in Vercel's serverless function on every such
// request. The logo is embedded as a base64 string constant rather than read
// from disk at runtime: two earlier attempts (public/images/recipeprinter-
// logo.png, then a co-located file read via fs.readFileSync) both threw
// ENOENT specifically on Vercel — `public/` is never bundled into the
// serverless function, and Next's build tracing didn't reliably include the
// co-located file either — even though both worked fine locally. A string
// constant has no such dependency, since it's just JS bundled with a module
// that's already proven to load correctly.
const logoUrl = `data:image/png;base64,${OPENGRAPH_IMAGE_LOGO_BASE64}`;
// A REAL card, not a drawing of one: scripts/build-og-card.mjs seeds the queue,
// loads /print, and photographs what the app renders. The version before this
// faked a card out of grey bars, which is precisely what made the preview look
// machine-generated — the bars were the tell.
const cardUrl = `data:image/png;base64,${OPENGRAPH_CARD_BASE64}`;

// Satori takes font data, not a CSS family name — without these the card
// renders in its bundled Noto Sans. See opengraph-image-karla-base64.ts.
function fontData(base64: string): ArrayBuffer {
  const binary = Buffer.from(base64, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}

// The app's own tokens, spelled out because Satori has no :root to read from.
// Keep in step with `:root` in app/globals.css — these are the same five values
// (docs/color-roles.md), not a palette picked for this file.
const PAGE = "#f4f7f3"; // Pale Mint
const INK = "#22303a"; // Slate
const MUTED = "#5f6f79"; // Stone
const LINE = "rgba(34, 48, 58, 0.11)";

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
          alignItems: "center",
          gap: "36px",
          padding: "64px",
          background: PAGE,
          color: INK,
          fontFamily: "Karla",
        }}
      >
        {/* ── The words ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", width: "516px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* Not next/image, and the LCP advice that rule gives doesn't apply
                here: this tree is never rendered in a browser. Satori
                rasterizes it to a PNG inside `ImageResponse`, and supports a
                small subset of HTML/CSS in which `next/image` — a React client
                component — cannot run at all. `<img>` with a base64 data URI is
                the documented way to place an image in an OG card. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" width="46" height="46" style={{ objectFit: "contain" }} />
            <div style={{ display: "flex", fontSize: "29px", fontWeight: 800, letterSpacing: "0" }}>
              {SITE_NAME}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "44px",
              fontSize: "62px",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            }}
          >
            Print the recipes worth making again.
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "26px",
              fontSize: "25px",
              fontWeight: 400,
              lineHeight: 1.4,
              color: MUTED,
            }}
          >
            Turn web and social recipe links into printable recipe cards and PDFs.
          </div>
        </div>

        {/* ── The thing you actually get ─────────────────────────────────────
            An actual 6x4 Bistro card, rendered by the app and photographed —
            its checkerboard spine, its coral headings, its blue bullets, its
            real "continued on back" overflow. Two of them, fanned: a single
            rectangle is the stock product shot, and a short stack says the
            plural thing the product makes. */}
        <div style={{ display: "flex", position: "relative", width: "520px", height: "340px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardUrl}
            alt=""
            width="430"
            height="280"
            style={{
              position: "absolute",
              top: "42px",
              left: "0px",
              borderRadius: "12px",
              boxShadow: "0 16px 40px rgba(34, 48, 58, 0.14)",
              transform: "rotate(-5deg)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardUrl}
            alt=""
            width="430"
            height="280"
            style={{
              position: "absolute",
              top: "14px",
              left: "44px",
              borderRadius: "12px",
              boxShadow: "0 26px 60px rgba(34, 48, 58, 0.2)",
              transform: "rotate(2deg)",
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Karla",
          data: fontData(OPENGRAPH_KARLA_REGULAR_BASE64),
          weight: 400,
          style: "normal",
        },
        {
          name: "Karla",
          data: fontData(OPENGRAPH_KARLA_EXTRABOLD_BASE64),
          weight: 800,
          style: "normal",
        },
      ],
    },
  );
}
