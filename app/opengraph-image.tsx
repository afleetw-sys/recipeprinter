import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";
import { OPENGRAPH_IMAGE_LOGO_BASE64 } from "@/app/opengraph-image-logo-base64";
import {
  OPENGRAPH_KARLA_EXTRABOLD_BASE64,
  OPENGRAPH_KARLA_REGULAR_BASE64,
} from "@/app/opengraph-image-karla-base64";

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
// renders in its bundled Noto Sans. See opengraph-image-karla-base64.ts.
function fontData(base64: string): ArrayBuffer {
  const binary = Buffer.from(base64, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}

// The app's own tokens, spelled out because Satori has no :root to read from.
// Keep in step with `:root` in app/globals.css — these are the same five values
// (docs/color-roles.md), not a palette picked for this file.
const PAGE = "#f4f7f3"; // Pale Mint
const CARD = "#ffffff";
const INK = "#22303a"; // Slate
const MUTED = "#5f6f79"; // Stone
const ACCENT = "#4a6fa8"; // Cornflower
const ACCENT_DEEP = "#3f6094"; // the Classic card's printed-label blue
const CLAY = "#c96a4c";
const LINE = "rgba(34, 48, 58, 0.11)";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * A ruled line standing in for a line of recipe text in the card mockup.
 * `w` is a percentage so the ragged right edge reads as real copy rather than
 * a stack of identical bars.
 */
function Rule({ w, bullet = false }: { w: string; bullet?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", height: "11px" }}>
      {bullet ? (
        <div
          style={{
            display: "flex",
            width: "5px",
            height: "5px",
            borderRadius: "999px",
            // The Classic card's ingredient bullets, which are the one place
            // clay appears on paper (--recipe-bullet in print.css).
            background: CLAY,
          }}
        />
      ) : null}
      <div style={{ display: "flex", width: w, height: "5px", borderRadius: "999px", background: LINE }} />
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: "40px",
          padding: "72px",
          background: PAGE,
          color: INK,
          fontFamily: "Karla",
        }}
      >
        {/* ── The words ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", width: "556px" }}>
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
              fontSize: "68px",
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
              fontSize: "27px",
              fontWeight: 400,
              lineHeight: 1.4,
              color: MUTED,
            }}
          >
            Turn web and social recipe links into printable recipe cards and PDFs.
          </div>
        </div>

        {/* ── The thing you actually get ─────────────────────────────────────
            The old card was a headline on a slab of cream with a rule under the
            wordmark: a layout that would have fronted any product at all, which
            is what made it read as generic. This is the Classic recipe card
            instead — its real accent bar, its cornflower section labels, its
            clay bullets — because the product is a printed card and the social
            card should show one.

            Two of them, fanned. A single floating rectangle is the stock
            product-shot composition; a short stack says the plural thing the
            product actually makes, and fills a right-hand third that was
            otherwise empty air. */}
        <div style={{ display: "flex", position: "relative", width: "420px", height: "300px" }}>
          {/* The one behind. Only its edge shows, so it carries no content —
              Satori draws exactly what it is told and an unseen column of rules
              is just rasterizer time. */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: "16px",
              left: "6px",
              width: "372px",
              height: "268px",
              background: CARD,
              borderRadius: "16px",
              border: `1px solid ${LINE}`,
              boxShadow: "0 18px 44px rgba(34, 48, 58, 0.12)",
              transform: "rotate(-5deg)",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              top: "0px",
              left: "34px",
              width: "372px",
              background: CARD,
              borderRadius: "16px",
              border: `1px solid ${LINE}`,
              boxShadow: "0 26px 62px rgba(34, 48, 58, 0.18)",
              overflow: "hidden",
              transform: "rotate(2deg)",
            }}
          >
            {/* The Classic card's header bar: two shades of the dark blue,
                never a hue change. See `.recipe-card__accent` in print.css. */}
            <div
              style={{
                display: "flex",
                height: "8px",
                background: `linear-gradient(90deg, ${ACCENT_DEEP}, ${INK})`,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", padding: "26px 26px 30px" }}>
              <div style={{ display: "flex", fontSize: "27px", fontWeight: 800, letterSpacing: "-0.02em" }}>
                Buttermilk Biscuits
              </div>
              <div style={{ display: "flex", marginTop: "7px", fontSize: "13px", color: MUTED }}>
                25 min · Serves 8
              </div>

              <div style={{ display: "flex", gap: "22px", marginTop: "24px" }}>
                <div style={{ display: "flex", flexDirection: "column", width: "144px", gap: "9px" }}>
                  <div
                    style={{
                      display: "flex",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      color: ACCENT_DEEP,
                    }}
                  >
                    INGREDIENTS
                  </div>
                  <Rule w="118px" bullet />
                  <Rule w="96px" bullet />
                  <Rule w="126px" bullet />
                  <Rule w="86px" bullet />
                  <Rule w="110px" bullet />
                </div>

                <div style={{ display: "flex", flexDirection: "column", width: "144px", gap: "9px" }}>
                  <div
                    style={{
                      display: "flex",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      color: ACCENT_DEEP,
                    }}
                  >
                    STEPS
                  </div>
                  <Rule w="140px" />
                  <Rule w="122px" />
                  <Rule w="136px" />
                  <Rule w="104px" />
                  <Rule w="130px" />
                </div>
              </div>
            </div>
          </div>
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
