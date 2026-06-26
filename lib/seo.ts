// ─────────────────────────────────────────────────────────────────────────
// Central SEO configuration for RecipePrinter.
//
// Everything that needs to know "what is this site, and what does it rank for"
// reads from here: root metadata, the homepage, sitemap.ts, robots.ts, the
// OpenGraph image, and the JSON-LD blocks. Keeping a single source of truth is
// what lets us add future public recipe pages (e.g. /recipes/[slug]) without
// re-deriving titles, canonical URLs, or schema in five different places.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";

/**
 * Canonical production origin. Override with NEXT_PUBLIC_SITE_URL in the
 * environment (Vercel/preview/prod). No trailing slash.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recipeprinter.com"
).replace(/\/$/, "");

export const SITE_NAME = "RecipePrinter";

/** The phrase we most want to own. Used in titles and the WebApplication name. */
export const SITE_TAGLINE = "Print any recipe without the clutter";

/**
 * Primary meta description. Written to read naturally to a human in a search
 * result while covering the core intents: print a recipe from a website/URL,
 * turn online recipes into a clean printable page/PDF, no ads.
 */
export const SITE_DESCRIPTION =
  "RecipePrinter turns any online recipe into a clean, printable page in seconds. " +
  "Paste a recipe URL, upload a photo, or paste recipe text and print it without ads, " +
  "pop-ups, or life stories — or save it as a PDF. Print multiple recipes at once.";

/**
 * Search intents we want the product to be the natural answer for. These are
 * surfaced as a meta keywords list and, more importantly, woven into the real
 * page copy and FAQ below — never stuffed.
 */
export const SITE_KEYWORDS = [
  "recipe printer",
  "print recipes",
  "print recipe online",
  "print recipe from website",
  "print recipe from URL",
  "convert online recipes to printable",
  "printable recipe",
  "print recipe without ads",
  "recipe PDF",
];

/** The team behind RecipePrinter — used as publisher/provider in JSON-LD. */
export const PUBLISHER = {
  name: "CookPilot",
  url: "https://cookpilotapp.com",
};

/** Join a path onto the canonical origin. `absoluteUrl("/")` → site root. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── Site navigation ──────────────────────────────────────────────────────────
// The homepage stays a focused utility. The deeper, genuinely-useful pages are
// reachable from the footer (and cross-linked from each other). New public
// sections — including future /recipes pages — slot in here without a redesign.
export interface NavLink {
  href: string;
  label: string;
  /** One-line summary, used in footer/links and as a fallback description. */
  blurb: string;
}

export const NAV_LINKS: NavLink[] = [
  {
    href: "/how-it-works",
    label: "How it works",
    blurb: "The three steps from a messy web page to a clean printed recipe.",
  },
  {
    href: "/features",
    label: "Features",
    blurb: "Everything RecipePrinter does, from ad-free pages to batch printing.",
  },
  {
    href: "/faq",
    label: "FAQ",
    blurb: "Answers about ads, PDFs, photos, multiple recipes, and privacy.",
  },
  {
    href: "/about",
    label: "About",
    blurb: "Why we built a free, no-clutter recipe printer.",
  },
];

/**
 * Per-page metadata helper. Keeps canonical URLs, OpenGraph, and Twitter tags
 * consistent across every page so we never re-derive them by hand. The document
 * <title> picks up the "%s · RecipePrinter" template from the root layout.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const ogTitle = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: ogTitle, description, url: path },
    twitter: { title: ogTitle, description },
  };
}

// ── FAQ ────────────────────────────────────────────────────────────────────
// Shared by both the rendered <section> and the FAQPage JSON-LD so the answers
// can never drift apart. Questions are phrased the way people actually search.

export interface FaqItem {
  question: string;
  /** Plain-text answer (also used verbatim in JSON-LD). */
  answer: string;
}

export const FAQ: FaqItem[] = [
  {
    question: "How do I print an online recipe without ads?",
    answer:
      "Paste the recipe's web address into RecipePrinter and we pull out just the title, " +
      "ingredients, and steps — leaving behind the ads, pop-ups, comments, and the long " +
      "story above the recipe. You get a clean, letter-size page you can print or save as a PDF.",
  },
  {
    question: "Can I print recipes from any website?",
    answer:
      "Yes. RecipePrinter works with recipes from across the web — paste the URL from almost " +
      "any cooking site and we convert the online recipe into a printable page. If a site is " +
      "unusual, you can also paste the recipe text directly or upload a photo of it.",
  },
  {
    question: "Can I print multiple recipes at once?",
    answer:
      "Yes. Add as many recipes as you like to your print queue from different sources, select " +
      "the ones you want, and print them all together in a single job — handy for weekly meal prep.",
  },
  {
    question: "Can I save a recipe as a PDF instead of printing it?",
    answer:
      "Absolutely. Every recipe is rendered as a clean printable page, so in the print dialog you " +
      "can choose “Save as PDF” to keep a tidy, ad-free recipe PDF on your device.",
  },
  {
    question: "Can I print a recipe from a photo or screenshot?",
    answer:
      "Yes. Upload a photo of a cookbook page or a screenshot of a recipe and RecipePrinter reads " +
      "the ingredients and steps, then turns them into the same clean printable recipe.",
  },
  {
    question: "Do I need an account, and are my recipes saved?",
    answer:
      "No account is required and nothing is stored on a server. Your print queue lives in your " +
      "browser for the current session only, so your recipes stay private to you.",
  },
];

/**
 * The handful of questions worth surfacing on the focused homepage. The full
 * set lives on /faq (which also carries the FAQPage structured data). These are
 * the three intents users ask most: ads, any-website, and batch printing.
 */
export const HOME_FAQ: FaqItem[] = FAQ.slice(0, 3);

// ── JSON-LD builders ─────────────────────────────────────────────────────────

/**
 * WebApplication schema describing the product itself. This is the structured-
 * data anchor that tells search engines RecipePrinter is a free web tool for
 * printing recipes, not a single article.
 */
export function webApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    alternateName: "Recipe Printer",
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript.",
    inLanguage: "en",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Print recipes from a website URL",
      "Convert online recipes to a clean printable page",
      "Print recipes without ads or pop-ups",
      "Save recipes as a PDF",
      "Print a recipe from a photo or screenshot",
      "Paste recipe text and print it",
      "Print multiple recipes at once",
    ],
    publisher: {
      "@type": "Organization",
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
  };
}

/** FAQPage schema built from the shared FAQ array above. */
export function faqJsonLd(items: FaqItem[] = FAQ) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
