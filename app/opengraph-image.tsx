import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";
import { OPENGRAPH_IMAGE_LOGO_BASE64 } from "@/app/opengraph-image-logo-base64";
import {
  OPENGRAPH_MANROPE_EXTRABOLD_BASE64,
  OPENGRAPH_MANROPE_REGULAR_BASE64,
} from "@/app/opengraph-image-manrope-base64";

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

// Satori takes font data, not a CSS family name — without these the card
// renders in its bundled Noto Sans, which is nowhere else in the product. See
// opengraph-image-manrope-base64.ts.
function fontData(base64: string): ArrayBuffer {
  const binary = Buffer.from(base64, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}

// Lifted from the print themes rather than picked fresh, so the card people see
// in a shared link is set on the same stock as the thing they'll actually print.
// `paper`/`ink`/`muted` are Keepsake's card values (print.css); `accent` is
// Classic's teal. The previous version of this card was a teal gradient with
// white type — a graphic that could have fronted any product. Cream paper and
// the card's own hairline header rule is the print side of the product showing
// through. Colour lands once, on that rule; a separate accent bar under the
// headline just read as a stray underline against the descenders.
const PAPER = "#fbf7ee";
const INK = "#242424";
const MUTED = "#64615b";
const ACCENT = "#2f7d78";

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
          padding: "88px",
          background: PAPER,
          color: INK,
          fontFamily: "Manrope",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "22px",
            paddingBottom: "32px",
            // The recipe card's own header divider (`.recipe-card__header`
            // carries this same hairline), not a decorative flourish — struck
            // in the accent so the card's one note of colour is part of the
            // structure rather than an ornament floating beside it.
            borderBottom: `2px solid ${ACCENT}`,
          }}
        >
          {/* Not next/image, and the LCP advice the rule is giving doesn't
              apply here: this tree is never rendered in a browser. Satori
              rasterizes it to a PNG inside `ImageResponse`, and it supports
              a small subset of HTML/CSS in which `next/image` — a React
              client component — cannot run at all. `<img>` with a base64
              data URI is the documented way to place an image in an OG
              card. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width="64"
            height="64"
            style={{
              objectFit: "contain",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "36px",
              // Matches `Wordmark` in components/Logo.tsx: extrabold, no tracking.
              fontWeight: 800,
              letterSpacing: "0",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "52px",
            fontSize: "82px",
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.025em",
            maxWidth: "880px",
          }}
        >
          Print the recipes worth making again.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "34px",
            fontSize: "33px",
            fontWeight: 400,
            lineHeight: 1.35,
            color: MUTED,
            maxWidth: "820px",
          }}
        >
          Turn web and social recipe links into printable recipe cards and PDFs.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Manrope",
          data: fontData(OPENGRAPH_MANROPE_REGULAR_BASE64),
          weight: 400,
          style: "normal",
        },
        {
          name: "Manrope",
          data: fontData(OPENGRAPH_MANROPE_EXTRABOLD_BASE64),
          weight: 800,
          style: "normal",
        },
      ],
    },
  );
}
