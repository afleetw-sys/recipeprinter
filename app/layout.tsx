import type { Metadata, Viewport } from "next";
import {
  Birthstone,
  Gochi_Hand,
  IBM_Plex_Mono,
  Jost,
  Karla,
  Manrope,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { KeyboardInsetWatcher } from "@/components/KeyboardInsetWatcher";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { ThemeLab } from "@/components/ThemeLab";
import { APPLY_UI_THEME_SOURCE } from "@/lib/uiThemes";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  PUBLISHER,
} from "@/lib/seo";

// Manrope, CookPilot's UI typeface. Matching it is what makes RecipePrinter
// read as a sibling product rather than a separate app.
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

// ── UI theme typefaces (experimental) ──────────────────────────────────────
// One face per alternate skin in the UI THEMES section of globals.css. The
// typeface is most of what makes a theme read as an era — Atomic Age is a
// mid-century geometric, Thermal Roll is the monospace a receipt printer would
// have used — so a theme that only swapped colours would land as a recolour.
//
// `preload: false` for the same reason Playfair and the two scripts have it,
// and it matters more here: these are painted only when someone has actually
// picked that theme, which nobody visiting the marketing pages has. Without it
// next/font would treat all three as used on every route and inject a
// render-blocking preload for each, so the homepage would pay for three extra
// font files to support a switcher it never opens. With it off, the chosen
// theme's face resolves via `display: swap` the moment the theme is applied.

// Futura's closest relative on Google Fonts, and the shape of nearly every
// mid-century American appliance label.
const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
  preload: false,
});

// Thermal Roll sets the whole UI in mono, not just its labels: the point of
// the theme is a receipt, and a receipt has one typeface.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
  display: "swap",
  preload: false,
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
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
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
      /* The pre-paint script below writes `data-ui-theme` onto this element
         before React hydrates, which React reports as an attribute the server
         didn't send. Scoped to <html> only, so a real mismatch anywhere inside
         the page is still reported. */
      suppressHydrationWarning
      className={`${manrope.variable} ${playfair.variable} ${birthstone.variable} ${gochiHand.variable} ${jost.variable} ${plexMono.variable} ${karla.variable}`}
    >
      <head>
        {/* Applies the saved UI theme before first paint. An effect would run
            after React has already painted the default theme, so every visit
            in a non-default theme would open on a flash of teal-on-white. */}
        <script dangerouslySetInnerHTML={{ __html: APPLY_UI_THEME_SOURCE }} />
      </head>
      <body>
        <KeyboardInsetWatcher />
        <AnalyticsProvider />
        {children}
        <ThemeLab />
      </body>
    </html>
  );
}
