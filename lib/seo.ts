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
import { FREE_COOKBOOK_RECIPES, FREE_IMPORTS_PER_WINDOW, FREE_IMPORT_WINDOW_DAYS } from "@/lib/freeImports";
import { COOKBOOK_DISCOUNT_PRICE_FALLBACK, COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { proAnnualSavingsPercent } from "@/lib/proProduct";

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
 * The team behind RecipePrinter, used as publisher/provider in JSON-LD.
 * `profiles` are CookPilot's own accounts: they go out as `sameAs` on the
 * parentOrganization node, never on RecipePrinter's.
 */
export const PUBLISHER = {
  name: "CookPilot",
  url: "https://cookpilotapp.com",
  profiles: [
    "https://apps.apple.com/us/app/cookpilot-recipes-that-adapt/id6753838076",
    "https://www.instagram.com/getcookpilot/",
    "https://www.tiktok.com/@getcookpilot",
    "https://www.pinterest.com/getcookpilot/",
    "https://www.crunchbase.com/organization/cookpilot",
  ],
};

/**
 * RecipePrinter's own public profiles. Surfaced as `sameAs` in the
 * Organization JSON-LD: this is how search engines and AI assistants connect
 * the website to a known brand entity, which is a major input into whether
 * they cite or recommend the product. `sameAs` means "this account is this
 * same entity", so only RecipePrinter accounts belong here. CookPilot's go in
 * PUBLISHER.profiles.
 */
export const SOCIAL_PROFILES = [
  "https://www.pinterest.com/recipeprinter/",
  "https://www.producthunt.com/products/recipeprinter",
  "https://peerlist.io/awinger/project/free-recipe-printer-for-online-recipes",
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
   *
   * `"off-home"` is the middle setting: every footer except the homepage's.
   * For a page the homepage itself already is, but that the rest of the site
   * has no other way to reach.
   */
  inFooter?: boolean | "off-home";
}

export const NAV_LINKS: NavLink[] = [
  {
    href: "/how-it-works",
    label: "How it works",
    blurb: "The three steps from a recipe link to a printed recipe card or PDF.",
    // Off the homepage's footer, on everyone else's. Someone who has landed on
    // the homepage is looking at the thing itself — the three steps are the
    // page in front of them — so the link stays out of the way there. Out of
    // every footer, though, it left this page with a single link in from the
    // whole site (/about), which is as good as telling a crawler it does not
    // matter. A reader on a guide or the FAQ is not looking at the tool, and
    // for them it is a real next page.
    inFooter: "off-home",
  },
  {
    href: "/features",
    label: "Features",
    blurb: "Everything RecipePrinter does for printing, saving, and collecting recipes.",
  },
  {
    href: "/pricing",
    label: "Pricing",
    blurb: "What's free, what RecipePrinter Pro adds, and what a cookbook costs.",
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
    // Off the homepage's footer (Amelia, 2026-11-18): it does little search
    // work there, and the homepage row is better spent on pages that sell.
    // Still in every other footer, so it keeps links in.
    inFooter: "off-home",
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
 * The branded card app/opengraph-image.tsx draws, as pages have to name it.
 * Keep the size and alt in step with that file's own exports.
 */
const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}: ${SITE_TAGLINE}`,
};

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
    // Everything the root layout's blocks say has to be said again here. Next
    // does not merge `openGraph` or `twitter` across segments: a page that
    // sets either replaces the parent's whole, including the image Next adds
    // from app/opengraph-image.tsx. Leaving these out is how every page but
    // the homepage shared with no picture and the small "summary" card.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title: ogTitle,
      description,
      url: path,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [SOCIAL_IMAGE],
    },
  };
}

// ── FAQ ────────────────────────────────────────────────────────────────────
// Shared by both the rendered <section> and the FAQPage JSON-LD so the answers
// can never drift apart. Questions are phrased the way people actually search.
//
// Every price, plan and purchase claim here is checked against the code that
// enforces it: computeProLocks (lib/recipePrinterPurchases.ts) for what Pro
// gates and what a cookbook includes, lib/useCookbookPurchase.ts for what
// unlocks a book (only that book's own purchase, never Pro), lib/importMeter.ts
// for which imports count. Change the behaviour, change the answer.

/** The sections /faq is split into, in page order. */
export type FaqGroup =
  | "compare"
  | "start"
  | "cards"
  | "printing"
  | "cookbooks"
  | "pro"
  | "account"
  | "about";

export interface FaqItem {
  question: string;
  /** Plain-text answer (also used verbatim in JSON-LD). */
  answer: string;
  /**
   * Slugs of the landing pages that cover this answer at length, rendered
   * under the answer as a link row.
   *
   * Slugs rather than page objects on purpose: lib/seoLandingPages.ts already
   * imports from this file, so importing it back would close a cycle. The FAQ
   * page resolves them through SEO_LANDING_PAGE_MAP instead.
   *
   * These stay out of the JSON-LD. `acceptedAnswer.text` should read as the
   * plain prose Google may quote, not as prose with a link list stapled on.
   */
  guides?: string[];
  /**
   * Which section this sits under on /faq. "compare" is the one question
   * drawn as the Cookbook / Pro side-by-side near the top of the page rather
   * than as a card: customers kept mixing the two purchases up (Amelia,
   * 2026-11-19), and a paragraph buried in a list didn't stop that.
   */
  group: FaqGroup;
}

/** Section headings on /faq, and the short label each has in the jump list. */
export const FAQ_GROUPS: { id: Exclude<FaqGroup, "compare">; heading: string; nav: string }[] = [
  { id: "start", heading: "Getting started and importing", nav: "Getting started" },
  { id: "cards", heading: "Recipe cards", nav: "Recipe cards" },
  { id: "printing", heading: "Printing and PDFs", nav: "Printing and PDFs" },
  { id: "cookbooks", heading: "Cookbooks", nav: "Cookbooks" },
  { id: "pro", heading: "RecipePrinter Pro", nav: "Pro" },
  { id: "account", heading: "Account, privacy and billing", nav: "Account and billing" },
  { id: "about", heading: "About RecipePrinter", nav: "About" },
];

/** The 20% Pro members get off their first cookbook, as a whole percent. */
const COOKBOOK_PRO_DISCOUNT_PERCENT = 20;

export const FAQ: FaqItem[] = [
  // ── Cookbook or Pro ──
  {
    question: "Cookbook or Pro: which do I need?",
    group: "compare",
    answer: `Printing one full-page recipe at a time is free. A cookbook is for making one book: a cover, chapters, a table of contents and page numbers, with every theme and Customize theme included inside that book. It's ${COOKBOOK_PRICE_FALLBACK} per cookbook, and each cookbook is its own purchase. RecipePrinter Pro is a subscription for recipe cards: print several recipes at once, unlimited imports, 4×6 cards, every theme, Customize theme, no "Printed with RecipePrinter" line, and ${COOKBOOK_PRO_DISCOUNT_PERCENT}% off your first cookbook. It's $4.99 a month or $39.99 a year. Pro doesn't unlock a cookbook, and a cookbook doesn't add Pro to your recipe cards.`,
  },

  // ── Getting started and importing ──
  {
    // Was two questions with one answer between them: "How do I print a recipe
    // from a website?" and "Can I print a recipe from a URL?" both said paste a
    // link and print. This one carries what each of them had, the URL included.
    question: "How do I print a recipe from a website?",
    group: "start",
    answer:
      "Copy the page's URL, paste it into RecipePrinter, check the card or page it makes, and print. Any recipe site, food blog, or supported social post works, and you can choose Save as PDF in the print dialog instead of sending it to paper. If a site doesn't import cleanly, paste the recipe text or upload a screenshot.",
    guides: [
      "print-recipe-from-website",
      "just-the-recipe-alternative",
    ],
  },
  {
    question: "Can I print recipes from Pinterest, Instagram, or TikTok?",
    group: "start",
    answer:
      "Yes. Paste the link to the post and RecipePrinter reads the recipe out of it. When the recipe lives in a caption or a comment rather than on a page the post links to, paste that text or upload a screenshot.",
    guides: [
      "print-social-media-recipes",
      "print-pinterest-recipes",
      "print-instagram-recipes",
      "print-tiktok-recipes",
      "print-facebook-recipes",
      "print-youtube-recipes",
    ],
  },
  {
    question: "Can I print recipes from screenshots or photos?",
    group: "start",
    answer:
      "Yes. Upload a screenshot, cookbook page, old recipe card, or saved image and RecipePrinter will read the recipe and format it into a printable version.",
    guides: [
      "print-recipe-from-photo",
      "print-recipe-from-screenshot",
      "digitize-recipe-cards",
      "reciscan-alternative",
    ],
  },
  {
    question: "Can I paste recipe text instead of using a URL?",
    group: "start",
    answer:
      "Yes. If you have a recipe from a text message, email, document, or website that doesn't import cleanly, paste the recipe text directly and RecipePrinter will structure it into a printable recipe card or page.",
  },
  {
    // The meter (lib/importMeter.ts) skips cookbook mode and Pro; the window
    // is fixed from the first import (lib/freeImports.ts); photos are paced
    // by the hour on every plan (lib/imageImportQuota.ts).
    question: "How many recipes can I import for free?",
    group: "start",
    answer: `${FREE_IMPORTS_PER_WINDOW} every ${FREE_IMPORT_WINDOW_DAYS} days. The ${FREE_IMPORT_WINDOW_DAYS} days start with your first import, and when they're up you get all ${FREE_IMPORTS_PER_WINDOW} back. Editing and reprinting a recipe you've already imported doesn't use an import, and neither does adding a recipe to a cookbook. RecipePrinter Pro has unlimited imports. Photo imports are paced by the hour on every plan.`,
  },
  {
    question: "Do I need to install anything?",
    group: "start",
    answer:
      "No. RecipePrinter runs in the browser you're already using, on a phone or a computer. There's no app to download, no plugin, and no extension.",
  },

  // ── Recipe cards ──
  {
    question: "Can I make printable recipe cards from online recipes?",
    group: "cards",
    answer:
      "Yes. Paste a recipe link, upload a screenshot or photo, or paste recipe text, and it becomes a printable recipe card. A full page prints free. The 4×6 size is RecipePrinter Pro.",
    guides: [
      "recipe-card-printer",
    ],
  },
  {
    question: "What size are the printed recipe cards?",
    group: "cards",
    answer:
      "A full page for a binder, free, or a 4×6 card for a recipe box with RecipePrinter Pro. A recipe too long for one side continues on the back when Two-sided is on. On a 4×6 card, cut lines give you a trim guide for card stock.",
    guides: [
      "recipe-card-printer",
    ],
  },
  {
    question: "Can I edit a recipe before printing it?",
    group: "cards",
    answer:
      "Yes. The title, the ingredients and the steps are all editable on the card itself. Correct an amount, cut a step you don't need, or reword a line to say what you actually do.",
  },
  {
    question: "Can I change how the recipe cards look?",
    group: "cards",
    answer:
      "Yes. A theme changes a card's type, its border and how the photo sits, without touching the recipe underneath. Switch themes and every card follows. Two themes are free. Every other theme, and Customize theme for colours, text size, photo size and layout, come with RecipePrinter Pro. You can try any of them on your card before you decide.",
  },
  {
    question: "Can I print several recipes at once?",
    group: "cards",
    answer:
      "Yes, with RecipePrinter Pro. Add as many as you like and print them all at once, which is what most people do for a recipe binder or a week of dinners. Printing one recipe at a time is free, no account needed. Making a book of them? A cookbook holds as many recipes as you like without Pro.",
    guides: [
      "print-multiple-recipes",
      "print-meal-plan-recipes",
      "recipe-binder",
    ],
  },
  {
    // The footer line: components/RecipeCardPrint.tsx. Pro hides it
    // (`brandHidden`); cookbook pages never draw it.
    question: "What's the \"Printed with RecipePrinter\" line on my card?",
    group: "cards",
    answer:
      "A small line at the foot of a recipe card on the free plan. RecipePrinter Pro prints without it, and gives the recipe the space it took. Cookbook pages never have it.",
  },

  // ── Printing and PDFs ──
  {
    question: "Can I turn a recipe into a PDF?",
    group: "printing",
    answer:
      "Yes. Every recipe is formatted as a print-ready page, so you can print it on paper or choose Save as PDF in your browser's print dialog to keep a clean recipe PDF on your device.",
    guides: [
      "convert-recipe-to-pdf",
    ],
  },
  {
    question: "Can I print recipes without ads?",
    group: "printing",
    answer:
      "Yes. RecipePrinter keeps the recipe itself and leaves off ads, pop-ups, autoplay videos, comments, oversized photos, and other web page clutter when creating the printable version.",
    guides: [
      "print-recipe-without-ads",
    ],
  },
  {
    question: "Can I save printed recipes in a recipe binder?",
    group: "printing",
    answer:
      "Yes. Print recipes one at a time as full pages and file them yourself, or make the whole binder as a cookbook: RecipePrinter adds a cover, section pages, a table of contents, and page numbers, and saves one US Letter PDF ready for a 3-ring binder.",
    guides: [
      "recipe-binder",
      "organize-recipes",
    ],
  },

  // ── Cookbooks ──
  {
    question: "Can I make a cookbook from my recipes?",
    group: "cookbooks",
    answer:
      "Yes. Add your recipes to a cookbook, sort them into chapters, and choose a cover. RecipePrinter builds the table of contents and page numbers for you. Then print it at home on US Letter or send the file to Lulu or Blurb for a hardcover or spiral bound cookbook.",
    guides: [
      "family-recipe-book",
      "preserve-family-recipes",
      "how-to-print-a-cookbook",
    ],
  },
  {
    question: "Does RecipePrinter print and ship the book?",
    group: "cookbooks",
    answer:
      "RecipePrinter doesn't print or ship books. It makes the print-ready files, and you choose who prints them: your own printer, a copy shop, or Lulu or Blurb, which print, bind and ship the book to you. Extra copies cost only the printing.",
    guides: ["how-to-print-a-cookbook"],
  },
  {
    // Covers (CoverFace) and chapter openers both let a photo fill the page,
    // and with every line of text cleared the scrim behind the words goes too.
    question: "Can I use my own cover or chapter page designs?",
    group: "cookbooks",
    answer:
      "Yes. If you've designed your own cover or chapter pages, save each one as an image, upload it as that page's photo, and delete the words on the page. Your design fills the whole page, with nothing printed over it.",
  },
  {
    question: "How much does a cookbook cost?",
    group: "cookbooks",
    answer: `You can build and preview a cookbook free with up to ${FREE_COOKBOOK_RECIPES} recipes. To download it, print it, or add more than ${FREE_COOKBOOK_RECIPES} recipes, buy that cookbook for ${COOKBOOK_PRICE_FALLBACK}. RecipePrinter Pro members get ${COOKBOOK_PRO_DISCOUNT_PERCENT}% off their first cookbook, so it's ${COOKBOOK_DISCOUNT_PRICE_FALLBACK}.`,
  },
  {
    // computeProLocks lifts every theme, card-size and Customize lock in
    // cookbook mode; the book's own purchase is its only gate.
    question: "Do I need Pro to make a cookbook?",
    group: "cookbooks",
    answer:
      "No. A cookbook is its own purchase, on the free plan or on Pro. Every theme and Customize theme are included inside the cookbook, so you don't need Pro for the look you want.",
  },
  {
    question: "Does one purchase cover all my cookbooks?",
    group: "cookbooks",
    answer:
      "No. Each purchase unlocks one cookbook. In that cookbook you can add as many recipes as you like, keep editing after you buy, and download it again whenever you want. A second, different cookbook is a second purchase.",
  },
  {
    question: "Does buying a cookbook give me Pro?",
    group: "cookbooks",
    answer:
      "No. A cookbook unlocks that book. Recipe cards you print outside it stay on your plan, so on the free plan that's full-page cards, one at a time, with the two free themes.",
  },

  // ── RecipePrinter Pro ──
  {
    // The same benefits, in the same order, as PRO_BENEFITS in
    // lib/proUpgradeCopy.ts.
    question: "What does RecipePrinter Pro include?",
    group: "pro",
    answer: `Printing several recipes at once, unlimited imports, 4×6 recipe cards, every theme, Customize theme, prints without the "Printed with RecipePrinter" line, and ${COOKBOOK_PRO_DISCOUNT_PERCENT}% off your first cookbook.`,
  },
  {
    question: "How much is Pro, and can I cancel?",
    group: "pro",
    answer: `$4.99 a month or $39.99 a year, which saves ${proAnnualSavingsPercent()}%. It's a subscription, and you can cancel any time from Manage subscription on your account page. Pro stays on until the end of the period you've paid for.`,
  },
  {
    // useCookbookPurchase reads only the book's own unlock; Pro never
    // unlocks a book.
    question: "Does Pro include cookbooks?",
    group: "pro",
    answer: `No. Pro is for recipe cards. A cookbook is bought separately, one book at a time, and Pro members get ${COOKBOOK_PRO_DISCOUNT_PERCENT}% off their first one.`,
  },
  {
    question: "What happens to my recipes if Pro ends?",
    group: "pro",
    answer: `Anything you've printed or saved as a PDF is yours to keep, your saved recipes stay in your account, and any cookbook you've bought stays unlocked. You can keep printing for free, with ${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days, and come back to Pro whenever you like.`,
  },

  // ── Account, privacy and billing ──
  {
    question: "Do I need an account?",
    group: "account",
    answer:
      "Not to print. Paste a recipe, print it, and save it as a PDF without signing in. Signing in keeps your projects and cookbooks so you can come back to them later.",
  },
  {
    question: "Are my recipes stored on your servers?",
    group: "account",
    answer:
      "Not unless you sign in and save. Without an account, your recipes, projects and photos stay in this browser, and we can't see them. To read a recipe, we send it to our recipe-reading service, and if an import fails, we keep a copy of what you sent so we can fix it. Your browser also gets a random ID that counts your free imports. If you sign in and save, your projects and cookbooks are stored in your account. The privacy policy has the details.",
  },
  {
    question: "Is RecipePrinter free?",
    group: "account",
    answer: `Yes. You get ${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days, with no account required, and you can edit and print full-page recipes, one at a time, with two free themes, as often as you like. RecipePrinter Pro and cookbooks are both optional, and separate from each other.`,
  },

  // ── About RecipePrinter ──
  {
    question: "Why print recipes instead of cooking from a phone?",
    group: "about",
    answer:
      "Printed recipes don't lock, dim, run out of battery, disappear under notifications, or make you scroll with messy hands. They're also easier to mark up, and easier to hand on: a copy goes to a friend who asked for it, or into a box your kids take with them, without an account or an app on either end.",
    guides: ["screen-free-cooking"],
  },
  {
    question: "Is RecipePrinter a recipe app?",
    group: "about",
    answer:
      "No, and that's deliberate. RecipePrinter isn't a recipe discovery app, meal planner, grocery app, nutrition tracker, or social network. It's built for what happens after you've already found a recipe worth making again.",
  },
  {
    question: "What is the difference between CookPilot and RecipePrinter?",
    group: "about",
    answer:
      "CookPilot helps make recipes work for real life with substitutions, notes, adjustments, and cooking tools. RecipePrinter solves a simpler problem: getting recipes off the screen and into your kitchen. You can use RecipePrinter on its own or import recipes from CookPilot.",
  },
];

// ── JSON-LD builders ─────────────────────────────────────────────────────────
// Stable @id anchors so the Organization, WebSite, and WebApplication nodes can
// reference each other inside a single @graph instead of duplicating the brand.

const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;
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
      sameAs: PUBLISHER.profiles,
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
    // Editing and full-page printing stay genuinely free (no account, no
    // paywall), with a free allowance of imports every 30 days
    // (lib/freeImports.ts) — `isAccessibleForFree` is still true for that
    // core use. RecipePrinter Pro is a second, separate Offer: the physical
    // recipe-card experience (every theme, 4x6 cards, the card toolkit),
    // priced monthly or annually. Keep both listed rather than collapsing to
    // one Offer, so the structured data doesn't read as either "everything
    // is free" or "this costs money to use at all" — neither is accurate.
    isAccessibleForFree: true,
    isPartOf: { "@id": SITE_ID },
    offers: [
      {
        "@type": "Offer",
        name: "RecipePrinter Free",
        description: `${FREE_IMPORTS_PER_WINDOW} recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days, unlimited editing and full-page printing`,
        price: "0",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "RecipePrinter Pro",
        description: `Unlimited imports, every theme, 4×6 cards, and a way to print several recipes at once`,
        priceCurrency: "USD",
        priceSpecification: [
          {
            "@type": "UnitPriceSpecification",
            price: "4.99",
            priceCurrency: "USD",
            billingDuration: "P1M",
          },
          {
            "@type": "UnitPriceSpecification",
            price: "39.99",
            priceCurrency: "USD",
            billingDuration: "P1Y",
          },
        ],
      },
    ],
    featureList: [
      "Print recipes from websites and social URLs",
      "Turn recipe links into printable recipe cards and PDFs",
      "Convert online recipes to a clean printable page",
      "Keep the recipe and leave the web page behind",
      "Save recipes as a PDF",
      "Print a recipe from a photo or screenshot",
      "Paste recipe text and print it",
      "Build printable recipe collections and binders",
      "RecipePrinter Pro: every theme, 4×6 recipe cards, and a way to print several recipes at once",
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
export function faqJsonLd(items: Pick<FaqItem, "question" | "answer">[] = FAQ) {
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
