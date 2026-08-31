import type { Metadata, Viewport } from "next";
import { Birthstone, Gochi_Hand, Karla, Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";
import { KeyboardInsetWatcher } from "@/components/KeyboardInsetWatcher";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${playfair.variable} ${birthstone.variable} ${gochiHand.variable} ${karla.variable}`}
    >
      <body>
        <KeyboardInsetWatcher />
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}
