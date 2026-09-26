import type { Metadata, Viewport } from "next";
import {
  Birthstone,
  Cormorant_Garamond,
  Courier_Prime,
  DM_Sans,
  DM_Serif_Display,
  Gochi_Hand,
  Jost,
  Karla,
  Manrope,
  Nunito_Sans,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { NoFocusZoom } from "@/components/NoFocusZoom";
import { KeyboardInsetWatcher } from "@/components/KeyboardInsetWatcher";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { ActionTitles } from "@/components/ActionTitles";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  PUBLISHER,
} from "@/lib/seo";

// Manrope. No longer the UI face — Karla is (see below) — but still the face
// of every printed recipe card, which `.recipe-card-set` in print.css pins
// itself to. A card's typography belongs to its template, not to the app
// around it, so the two can move independently from here on.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

// Playfair Display, reserved for printed recipe titles only, giving the
// printed page a cookbook identity without touching CookPilot's sans-serif UI.
//
// preload: false on the three fonts below (Playfair + the two decorative
// scripts). They're only ever painted inside recipe-card templates and the
// template-picker samples — never in the marketing shell (header, hero,
// landing copy, footer all use Manrope). Declaring them in the root layout
// makes next/font treat them as "used" on every route and inject a
// render-blocking <link rel="preload"> for each, so the homepage and every
// SEO landing page (which carry the organic traffic and never show a card on
// first paint) were downloading three extra font files in competition with
// LCP. With preload off they still resolve via `display: swap` the instant a
// card or sample first needs them; the marketing pages just stop paying for
// them up front.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});

const birthstone = Birthstone({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-birthstone",
  display: "swap",
  preload: false,
});

const gochiHand = Gochi_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-gochi-hand",
  display: "swap",
  preload: false,
});

// The Typewriter theme's face. Card-only, so preload: false for the same
// reason as the decorative faces above.
const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-courier-prime",
  display: "swap",
  preload: false,
});

// Garden's faces: a Garamond title over a soft rounded sans.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
  display: "swap",
  preload: false,
});

// Market's faces: a chunky, friendly display serif over DM Sans.
const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif-display",
  display: "swap",
  preload: false,
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
});

// Quilt's face, title and body: Jost, a Futura-style geometric sans, for the
// tiles' mid-century look.
const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
  preload: false,
});

// Karla, the UI typeface. A grotesque with enough warmth and enough of its own
// character to sit beside the clay/cornflower palette without reading as a
// default system font.
const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
  display: "swap",
});

// resizes-content: on-screen keyboards shrink the layout viewport instead of
// overlaying it, so our `position: fixed; bottom: 0` bars land above the
// keyboard rather than getting hidden behind it. Supported in Chrome and
// Safari 17.4+; the VisualViewportInset watcher in the body covers the rest.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // Homepage uses the full default; inner pages get "<page> · RecipePrinter".
    default: "Free Recipe Printer for Online Recipes",
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: PUBLISHER.name, url: PUBLISHER.url }],
  creator: PUBLISHER.name,
  publisher: PUBLISHER.name,
  category: "food",
  alternates: {
    canonical: "/",
  },
  // ?v= is not decoration. These are fixed, unhashed paths, and a favicon is
  // the single most aggressively cached asset a browser holds — it survives
  // ordinary reloads and often a hard refresh too. Without a version marker a
  // logo change reaches nobody who has already visited: they keep the old mark
  // in the tab indefinitely. Bump this whenever the mark itself changes.
  icons: {
    icon: [
      { url: "/favicon-16x16.png?v=5", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=5", sizes: "32x32", type: "image/png" },
      { url: "/icon.png?v=5", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=5", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Free Recipe Printer for Online Recipes",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Recipe Printer for Online Recipes",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Pinterest claims a website by fetching its root URL and looking for this
  // tag in the <head>. It lives in the root layout, so it ships on every route
  // rather than only the homepage: Pinterest re-checks the claim periodically,
  // and a tag that exists on just one page is one refactor away from silently
  // unclaiming the domain. The value is a public verification token, not a
  // secret; it identifies the Pinterest account allowed to claim the domain.
  // Claiming is what puts our logo on every Pin that links back here and turns
  // on Pin analytics, which matters because the social landing pages target
  // people arriving from Pinterest in the first place.
  verification: {
    other: {
      "p:domain_verify": "33f6eb038e85de3d538515850ef09569",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${playfair.variable} ${birthstone.variable} ${gochiHand.variable} ${courierPrime.variable} ${cormorant.variable} ${nunitoSans.variable} ${jost.variable} ${dmSerifDisplay.variable} ${dmSans.variable} ${karla.variable}`}
    >
      <body>
        <KeyboardInsetWatcher />
        <NoFocusZoom />
        <AnalyticsProvider />
        <ActionTitles />
        {children}
      </body>
    </html>
  );
}
