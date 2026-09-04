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
export const SITE_TAGLINE = "Print recipes worth keeping";

/**
 * Primary meta description. Written to read naturally to a human in a search
 * result while covering the core intents: print a recipe from a website,
 * blog, or social URL; turn online recipes into a clean printable page/PDF;
 * no ads.
 */
export const SITE_DESCRIPTION =
  "Paste recipes from websites, social links, photos, or text and turn them " +
  "into printable recipe cards, pages, PDFs, and bound cookbooks worth keeping.";

/**
 * Search intents we want the product to be the natural answer for. These are
 * surfaced as a meta keywords list and, more importantly, woven into the real
 * page copy and FAQ below, never stuffed.
 */
export const SITE_KEYWORDS = [
  "recipe printer",
  "recipe printing tool",
  "print recipes",
  "print recipe online",
  "print recipe from website",
  "print recipe from URL",
  "print recipe from social media",
  "print recipe from social URL",
  "print recipe from Facebook",
  "print recipe from Instagram",
  "print recipe from Instagram Reels",
  "print recipe from TikTok",
  "print recipe from YouTube",
  "convert online recipes to printable",
  "printable recipe",
  "printable recipe cards",
  "printable recipe card generator",
  "printable recipe cards 4x6",
  "recipe card maker",
  "print recipe without ads",
  "print recipe without pictures",
  "recipe PDF",
  "convert recipe to PDF",
  "make a cookbook",
  "create a cookbook",
  "cookbook maker",
  "recipe book maker",
  "print your own cookbook",
  "family cookbook",
  "organize recipes",
  "recipe binder",
  "Just the Recipe alternative",
  "ReciScan alternative",
];

/** The team behind RecipePrinter, used as publisher/provider in JSON-LD. */
export const PUBLISHER = {
  name: "CookPilot",
  url: "https://cookpilotapp.com",
};

/**
 * Public brand profiles for the RecipePrinter/CookPilot product. Surfaced as
 * `sameAs` in the Organization JSON-LD: this is how search engines and AI
 * assistants connect the website to a known brand entity, which is a major
 * input into whether they cite or recommend the product. Add App Store, Google
 * Play, YouTube, Facebook, or LinkedIn URLs here as they come online.
 */
export const SOCIAL_PROFILES = [
  "https://cookpilotapp.com/",
  "https://apps.apple.com/us/app/cookpilot-recipes-that-adapt/id6753838076",
  "https://www.instagram.com/getcookpilot/",
  "https://www.tiktok.com/@getcookpilot",
  "https://www.pinterest.com/getcookpilot/",
  "https://www.crunchbase.com/organization/cookpilot",
  // Add the YouTube channel here once it has real content (at least a video or
  // two). An empty channel adds no trust signal, a crawler that follows it
  // finds nothing to corroborate, and a dead profile can read as a less-active
  // brand, so leave it out until there's something to link to.
];

/** Square brand logo, referenced by the Organization schema. */
export const LOGO_PATH = "/images/recipeprinter-logo.png";

/** Join a path onto the canonical origin. `absoluteUrl("/")` → site root. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── Site navigation ──────────────────────────────────────────────────────────
// The homepage stays a focused utility. The deeper, genuinely-useful pages are
// reachable from the footer (and cross-linked from each other). New public
// sections, including future /recipes pages, slot in here without a redesign.
export interface NavLink {
  href: string;
  label: string;
  /** One-line summary, used in footer/links and as a fallback description. */
  blurb: string;
  /**
   * Whether the site's own footer links to it. Absent = yes.
   *
   * A page can be worth having and worth indexing without belonging in the
   * chrome of every page on the site: the footer is a short list a visitor
   * reads, not an index of everything published. Turning this off keeps the
   * page in the sitemap and in llms.txt, so search engines still find it and
   * it still ranks — it just stops competing for attention in the footer.
   */
  inFooter?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  {
    href: "/how-it-works",
    label: "How it works",
    blurb: "The three steps from a recipe link to a printed recipe card or PDF.",
    // Search traffic, not site navigation. Someone who has already landed on
    // the homepage is looking at the thing itself — the three steps are the
    // page in front of them — so "How it works" and "Features" side by side in
    // the footer were two doors onto the same explanation. It keeps its place
    // in the sitemap, and /about still links to it, so it is reachable and
    // indexable without being chrome.
    inFooter: false,
  },
  {
    href: "/features",
    label: "Features",
    blurb: "Everything RecipePrinter does for printing, saving, and collecting recipes.",
  },
  {
    href: "/faq",
    label: "FAQ",
    blurb: "Answers about recipe links, PDFs, cookbooks, social recipes, binders, and privacy.",
  },
  {
    href: "/about",
    label: "About",
    blurb: "Why we built a tool for moving recipes from the internet to the kitchen.",
  },
];

/**
 * Legal pages. Deliberately NOT in NAV_LINKS: those are the pages we want
 * people to read and search engines to rank, and putting a privacy policy in
 * that row buries the FAQ next to it. These get their own quiet line beside the
 * copyright, which is where a reader already looks for them.
 *
 * They still belong in the sitemap — see app/sitemap.ts, which maps this array
 * in at a low priority so the two can never drift apart.
 */
export const LEGAL_LINKS: NavLink[] = [
  {
    href: "/privacy",
    label: "Privacy",
    blurb: "What happens to the recipes, photos, and details you bring to RecipePrinter.",
  },
  {
    href: "/terms",
    label: "Terms",
    blurb: "What you can do with RecipePrinter, what stays yours, and how purchases work.",
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
    question: "How do I print a recipe from a website?",
    answer:
      "Copy the recipe page URL, paste it into RecipePrinter, review the printable recipe card or page, and print it. You can also choose Save as PDF in your browser print dialog.",
  },
  {
    question: "Can I print a recipe from a URL?",
    answer:
      "Usually, yes. Paste a recipe link from a recipe website, food blog, or supported social post and RecipePrinter will turn it into a clean printable recipe card or page. If a site does not import cleanly, you can paste the recipe text directly or upload a screenshot instead.",
  },
  {
    question: "Can I turn a recipe into a PDF?",
    answer:
      "Yes. Every recipe is formatted as a print-ready page, so you can print it on paper or choose Save as PDF in your browser's print dialog to keep a clean recipe PDF on your device.",
  },
  {
    question: "Can I make printable recipe cards from online recipes?",
    answer:
      "Yes. Paste a recipe link, upload a screenshot or photo, or paste recipe text, then choose a printable recipe card layout before printing.",
  },
  {
    question: "Can I print recipes from Pinterest, Instagram, or TikTok?",
    answer:
      "Yes. Start with the original recipe link when one is available. For captions, screenshots, or saved social posts, you can paste the recipe text or upload a screenshot instead.",
  },
  {
    question: "Can I save printed recipes in a recipe binder?",
    answer:
      "Yes. RecipePrinter can create letter-size recipe pages, recipe cards, and PDFs that work well for binders, folders, recipe boxes, and family collections.",
  },
  {
    question: "Can I make a cookbook from my recipes?",
    answer:
      "Yes. Group your recipes into chapters, add a cover, and RecipePrinter builds a cookbook with an automatic table of contents. You can export it as a print-ready PDF to print at home in US Letter, or as a full-bleed 8 x 10 file to order a bound hardcover from a print-on-demand service like Lulu or Blurb.",
  },
  {
    question: "Why print recipes instead of cooking from a phone?",
    answer:
      "Printed recipes do not lock, dim, run out of battery, disappear under notifications, or make you scroll with messy hands. They are also easier to mark up and keep.",
  },
  {
    question: "Can I print recipes without ads?",
    answer:
      "Yes. RecipePrinter keeps the recipe itself and leaves off ads, pop-ups, autoplay videos, comments, oversized photos, and other web page clutter when creating the printable version.",
  },
  {
    question: "Can I print recipes from screenshots or photos?",
    answer:
      "Yes. Upload a screenshot, cookbook page, old recipe card, or saved image and RecipePrinter will read the recipe and format it into a printable version.",
  },
  {
    question: "Can I paste recipe text instead of using a URL?",
    answer:
      "Yes. If you have a recipe from a text message, email, document, or website that does not import cleanly, paste the recipe text directly and RecipePrinter will structure it into a printable recipe card or page.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. RecipePrinter works without an account, so you can paste a recipe, print it, save it as a PDF, and move on.",
  },
  {
    question: "Are my recipes stored on your servers?",
    answer:
      "Only if you choose to save them. Used without an account, your print queue lives in your browser for the current session only and is never stored on our servers. If you sign in and save a project or build a cookbook, that project is stored in your account so you can reopen it from any device.",
  },
  {
    question: "Is RecipePrinter free?",
    answer:
      "Printing recipes is free and does not require an account. There are two optional one-time purchases: premium print themes, and the cookbook builder that turns a set of recipes into a bound book. Current prices are shown in the app before you buy.",
  },
  {
    question: "Is RecipePrinter a recipe app?",
    answer:
      "Not really. RecipePrinter is not a recipe discovery app, meal planner, grocery app, nutrition tracker, or social network. It is built for what happens after you have already found a recipe worth making again.",
  },
  {
    question: "What is the difference between CookPilot and RecipePrinter?",
    answer:
      "CookPilot helps make recipes work for real life with substitutions, notes, adjustments, and cooking tools. RecipePrinter solves a simpler problem: getting recipes off the screen and into your kitchen. You can use RecipePrinter on its own or import recipes from CookPilot.",
  },
];

// ── JSON-LD builders ─────────────────────────────────────────────────────────
// Stable @id anchors so the Organization, WebSite, and WebApplication nodes can
// reference each other inside a single @graph instead of duplicating the brand.

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#webapp`;

/**
 * Organization schema for the RecipePrinter brand. This is the entity that
 * search engines and AI assistants resolve the site to: the logo and `sameAs`
 * profiles are what let them connect recipeprinter.com to a known, real product
 * and decide it is trustworthy enough to surface or recommend.
 */
export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: "Recipe Printer",
    url: absoluteUrl("/"),
    logo: absoluteUrl(LOGO_PATH),
    description: SITE_DESCRIPTION,
    sameAs: SOCIAL_PROFILES,
    parentOrganization: {
      "@type": "Organization",
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
  };
}

/** WebSite schema, tying the domain to the brand for sitelinks and citations. */
export function webSiteNode() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: absoluteUrl("/"),
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * WebApplication schema describing the product itself. This is the structured-
 * data anchor that tells search engines RecipePrinter is a free web tool for
 * printing recipes, not a single article.
 */
export function webApplicationNode() {
  return {
    "@type": "WebApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    alternateName: "Recipe Printer",
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript.",
    inLanguage: "en",
    isAccessibleForFree: true,
    isPartOf: { "@id": SITE_ID },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Print recipes from websites and social URLs",
      "Turn recipe links into printable recipe cards and PDFs",
      "Convert online recipes to a clean printable page",
      "Keep the recipe and leave the web page behind",
      "Save recipes as a PDF",
      "Print a recipe from a photo or screenshot",
      "Paste recipe text and print it",
      "Print multiple recipes at once",
      "Build printable recipe collections and binders",
      "Make a cookbook with a cover, chapters, and an automatic table of contents",
      "Export a print-ready cookbook PDF for home printing or professional binding",
    ],
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The homepage's combined structured data: Organization + WebSite +
 * WebApplication in one @graph, cross-linked by @id so crawlers see a single,
 * coherent brand entity rather than three loose nodes.
 */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), webSiteNode(), webApplicationNode()],
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

/**
 * BreadcrumbList node for a page's trail. Pass absolute URLs (via `absoluteUrl`).
 * Returned as a bare node so it can be dropped into a page's @graph next to the
 * WebPage/FAQ/HowTo nodes rather than emitted as its own script.
 */
export function breadcrumbNode(trail: { name: string; url: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/**
 * HowTo node from a page's step list. Google has largely retired HowTo rich
 * results, but the markup still helps AI answer engines and entity understanding
 * and costs nothing, the same call Canva still ships on its create pages.
 */
export function howToNode(name: string, steps: { name: string; text: string }[]) {
  return {
    "@type": "HowTo",
    name,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      itemListElement: {
        "@type": "HowToDirection",
        text: step.text,
      },
    })),
  };
}
