import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import type { ImportTab } from "@/types/recipe";
import { PRINTERS } from "@/lib/cookbookPresets";

/** Icon slugs a value-prop chip can use, resolved to real icons in the template. */
export type SeoIconKey =
  | "link"
  | "image"
  | "text"
  | "print"
  | "pdf"
  | "book"
  | "clock"
  | "check"
  | "users"
  | "crown";

/** Which claim-specific proof visual a feature row draws (placeholder for now). */
export type SeoProofKind =
  | "before-after"
  | "pdf"
  | "card"
  | "social"
  | "photo"
  | "binder"
  | "book"
  | "steps";

/**
 * One cell of a comparison row.
 *
 * `true` is a plain tick, `false` a dash, and a string is a tick plus the terms
 * it comes on ("Free, no account"). Tick-and-dash is the convention every
 * comparison table uses because it needs no decoding; an earlier three-state
 * scale of filled, half-filled and empty dots was more precise and had to be
 * explained by a legend before it could be read at all.
 *
 * Where a row is not a plain yes on either side, both cells take a string, and
 * the two strings answer the same question: "Free, no account" against "Paid
 * plan", not against a bare tick.
 */
export type ComparisonValue = boolean | string;

export type SeoLandingPage = {
  slug: string;
  /**
   * The date this page's content was last read end to end and signed off
   * (YYYY-MM-DD). Not rendered — it marks which pages have had a real pass and
   * feeds the sitemap's <lastmod>, so "we reviewed this" and "we told Google it
   * changed" can never drift apart. Leave unset until a page is actually done.
   */
  lastReviewed?: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: "Utility SEO" | "Organization SEO" | "Preservation and Gift SEO";
  /**
   * Where the shared SEO page asks the visitor to begin. Utility intent puts
   * capture in the hero; guide intent introduces the broader workflow first
   * and moves capture below the explanatory sections. This changes sequence,
   * not the site's visual language.
   */
  layout?: "capture-first" | "guide-first";
  eyebrow: string;
  statusNote?: string;
  initialImportMode?: ImportTab;
  importSubmitLabel?: string;
  /** A FEATURE_IMAGES key for the hero photo, when the page's subject is not
      one of the printed cards. Without it every utility page opens on the same
      card. */
  heroImage?: string;
  /** Heading over the guide-first capture block. Hardcoded to "Start your
      family cookbook" until four guide pages that are not about cookbooks
      inherited it. */
  captureHeading?: string;
  /** Reassurance below capture; false hides the default utility-page message. */
  captureReassurance?: string | false;
  /** Short hint shown under the capture block when the preselected mode needs a caveat. */
  importHint?: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  /** One-sentence emotional hook opening the content scaffold. */
  intro?: string;
  /** "How to …" steps, renders the section and the HowTo JSON-LD. */
  howTo?: { name: string; text: string }[];
  /** 2–3 deep-dive sections, each targeting a secondary keyword, with a proof
      visual. `caption` labels that row's visual; omit it when the image already
      labels itself, rather than captioning it with something generic. */
  featureSections?: {
    heading: string;
    body: string;
    proof?: SeoProofKind;
    caption?: string;
    /** Names a specific visual, overriding the one `proof` would pick. Use when
        two rows would otherwise land on the same image. */
    image?: string;
  }[];
  /**
   * Head-to-head feature table for a competitor page. Only worth adding when
   * we can state the other tool's behaviour accurately, including the rows it
   * wins: a table where one column is all ticks reads as a pitch, and a
   * visitor who already uses the competitor knows which claims are wrong.
   */
  comparison?: {
    competitor: string;
    /** When the competitor's site and pricing were last read. Not rendered —
        it records who the claims were checked against and when, the same way
        `lastReviewed` records a content pass, so a stale table is greppable
        rather than invisible. */
    checked: string;
    /** Labelled groups, not a flat list: a run of ten unbroken rows is the
        thing readers skim past. Order them by what a visitor is deciding, not
        by where we look best. */
    groups: {
      title: string;
      rows: { feature: string; us: ComparisonValue; them: ComparisonValue }[];
    }[];
  };
  /** Real printed-card photo keys (PRINTED_CARDS) for the examples gallery. */
  examples?: string[];
  /** `links` hangs outbound chips under an answer, for the questions whose
      real answer is somewhere else. The JSON-LD keeps `answer` alone: the
      structured data is the answer, not the chrome around it. */
  faqs: {
    question: string;
    answer: string;
    links?: { href: string; label: string; note?: string }[];
  }[];
  links: { href: string; label: string }[];
};

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "print-recipe-from-website",
    lastReviewed: "2026-09-02",
    primaryKeyword: "print recipe from website",
    secondaryKeywords: [
      "print recipe from food blog",
      "print recipe from recipe site",
      "print recipe website without clutter",
      "website to print recipes",
      // Absorbed from the retired /print-recipe-from-url page. Pasting a link
      // and pasting a URL are the same job, and two pages split the signal for
      // it; this one had the depth, so it took the phrasing too.
      "print recipe from URL",
      "recipe URL printer",
      "print recipe link",
      "printable recipe from link",
    ],
    intent: "Utility SEO",
    eyebrow: "Recipe printing tool",
    initialImportMode: "url",
    title: "Print a Recipe from Any Website",
    description:
      "Paste a recipe website or food blog link and turn it into a clean printable recipe card, page, or PDF.",
    h1: "Print a recipe from a website",
    lede:
      "Paste a link from a food blog or recipe site. RecipePrinter pulls out the recipe and sets it as a clean printable card, full page, or PDF.",
    howTo: [
      {
        name: "Copy the recipe link",
        text: "On the food blog or recipe site, copy the page link from your browser's address bar or the app's share button.",
      },
      {
        name: "Paste it in",
        text: "Paste the link into the box above. RecipePrinter reads the page and rebuilds the recipe as a clean, printable layout.",
      },
      {
        name: "Set the format",
        text: "Choose a recipe card or a full page, keep or drop the photo, and make any edits you want before you print.",
      },
      {
        name: "Print or save as PDF",
        text: "Send it to your printer, or choose Save as PDF in the print dialog to keep a copy on your phone or computer.",
      },
    ],
    featureSections: [
      {
        heading: "It keeps the recipe and drops everything else",
        proof: "before-after",
        body:
          "Printed straight from the browser, that caprese pasta salad runs to 26 sheets. RecipePrinter reads the same page and keeps only what you cook from: the ingredient list with amounts, the numbered steps, the prep and cook times, and the servings. The blogger's backstory, the autoplay video, the comments, and the ads stay behind. You can print the original link on the card too, so the page is easy to find again.",
      },
      {
        heading: "Print it the way your kitchen actually works",
        proof: "card",
        body:
          "Pick the format that fits how you cook. A 4 by 6 card drops straight into a recipe box or an index-card binder. A full letter page suits long bakes and doubled batches, with room in the margin for your own notes. Keep the finished-dish photo or leave it off to save ink, and the type stays large enough to read from across the counter.",
      },
      {
        heading: "For the pages that fight back",
        image: "paste-in-app",
        body:
          "Some recipes hide behind a login, sit on a site that blocks importers, or live only in a video's description. When a link won't import cleanly, paste the recipe text or upload a screenshot, and RecipePrinter structures it into the same clean printout. It works from a phone too, so you can grab a recipe on the couch and print it from the kitchen later.",
      },
    ],
    faqs: [
      {
        question: "How does it know which part of the page is the recipe?",
        answer:
          "Recipe sites publish their recipes as structured data so search engines can read them. RecipePrinter reads that same data, so the amounts and the steps arrive the way the site wrote them instead of being guessed at from the words on the page.",
      },
      {
        question: "Can I save the recipe as a PDF instead of printing?",
        answer:
          "Yes. RecipePrinter builds a print-ready page, so in the print dialog you can choose Save as PDF and keep a clean copy on your phone or computer to print whenever you want.",
      },
      {
        question: "Can I do this from my phone?",
        answer:
          "Yes. Paste the link in a phone browser and set the recipe up there, then use the phone's own print dialog to reach a wireless printer, or choose Save as PDF and print it from a computer later.",
      },
      {
        question: "Can I print several recipes in one go?",
        answer:
          "Yes. Paste in as many links as you want and print them as one job. That is the difference between seven trips to the printer and one, which is most of the point when you are printing a week of dinners at once.",
      },
      {
        question: "What happens if the original page disappears?",
        answer:
          "Nothing, which is the reason to print one in the first place. A recipe page can go behind a paywall, get rewritten around a new story, or go offline entirely, and none of that reaches the card already sitting in your kitchen.",
      },
    ],
    links: [
      { href: "/printable-recipe-card-generator", label: "Make printable recipe cards" },
      { href: "/print-recipe-without-ads", label: "Print recipes without ads" },
      { href: "/convert-recipe-to-pdf", label: "Convert a recipe to PDF" },
    ],
  },
  {
    slug: "print-recipe-without-ads",
    lastReviewed: "2026-09-02",
    primaryKeyword: "print recipe without ads",
    secondaryKeywords: [
      "print recipe without pictures",
      "print recipe from website without ads",
      "clean printable recipe",
      "print recipe without clutter",
    ],
    intent: "Utility SEO",
    eyebrow: "Ad-free recipe printing",
    initialImportMode: "url",
    title: "Print Recipes Without Ads",
    description:
      "Turn cluttered recipe pages into clean printable recipes without ads, pop-ups, comments, or wasted pages.",
    h1: "Print a recipe without ads",
    lede:
      "Send a recipe page to the printer and the ads and the comments come with it. RecipePrinter prints the recipe on its own, on one page you can cook from.",
    howTo: [
      {
        name: "Paste the recipe link",
        text: "Copy the link from the recipe site and paste it in. RecipePrinter rebuilds the recipe on a page of its own.",
      },
      {
        name: "Check the preview",
        text: "Look at the finished card before anything prints. What you see on screen is what comes out, down to the page count.",
      },
      {
        name: "Take out what you do not need",
        text: "Turn off Recipe photo to save the color ink, or Recipe link to drop the source line. What is left is the recipe.",
      },
      {
        name: "Print it, or keep the file",
        text: "Send it to the printer, or choose Save as PDF and keep the clean copy without printing anything at all.",
      },
    ],
    featureSections: [
      {
        heading: "One sheet instead of twenty-six",
        proof: "before-after",
        body:
          "RecipePrinter never prints the article. It reads the recipe out of the page and lays out a new one holding the ingredients, the steps, and the times, and nothing else. The browser's own print button has no way to do that. It prints the document it was handed, headnote, ad slots, comments and all.",
      },
      {
        heading: "Recipe cards don't go dark while you cook",
        image: "counter-card",
        body:
          "A card asks nothing of you: no unlocking, no charging, no signal. It props against the backsplash and stays on the step you are on. Nobody scrolls back up to check whether it was two teaspoons or two tablespoons.",
      },
    ],
    faqs: [
      {
        question: "Is this an ad blocker?",
        answer:
          "No. An ad blocker hides things on the page in front of you. RecipePrinter never prints that page at all: it reads the recipe out and builds a new one that only ever had the recipe on it.",
      },
      {
        question: "Can I see it before I print?",
        answer:
          "Yes. The preview is the finished sheet rather than an approximation of it, so the page count you see is the count that comes out of the tray.",
      },
      {
        question: "What about pop-ups and cookie banners?",
        answer:
          "They never reach the printer. Those overlays are drawn by your browser as the page loads, and RecipePrinter reads the recipe straight from the page's own data instead, so the box you would have had to close is never in the way.",
      },
      {
        question: "How much paper does one recipe take?",
        answer:
          "Usually one sheet. A recipe prints as a single 6 by 4 card or a single letter page, however long the article it came from happened to be.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/just-the-recipe-alternative", label: "Just the Recipe alternative" },
      { href: "/convert-recipe-to-pdf", label: "Save recipe as PDF" },
    ],
  },
  {
    slug: "convert-recipe-to-pdf",
    lastReviewed: "2026-09-02",
    primaryKeyword: "convert recipe to PDF",
    secondaryKeywords: [
      "recipe PDF generator",
      "save recipe as PDF",
      "recipe to PDF",
      "printable recipe PDF",
      "save online recipe as PDF",
    ],
    intent: "Utility SEO",
    eyebrow: "Recipe PDF tool",
    initialImportMode: "url",
    title: "Free Recipe to PDF Converter",
    description:
      "Turn recipes from links, photos, screenshots, or text into printable PDFs for saving, sharing, and cooking.",
    h1: "Convert a recipe to PDF",
    lede:
      "Turn a recipe link into a clean one-page PDF you can keep on your phone, send to someone, or print whenever you want.",
    howTo: [
      {
        name: "Paste the recipe link",
        text: "Copy the link from the recipe site and paste it in. A screenshot, a photo of an old card, or pasted text works the same way.",
      },
      {
        name: "Pick card or page",
        text: "Choose a 6 by 4 card or a full letter page. Whichever you pick is the shape the PDF comes out in.",
      },
      {
        name: "Choose Save as PDF",
        text: "Open your browser's print dialog and choose Save as PDF instead of a printer. There is no plugin to install and no account to make.",
      },
      {
        name: "Keep it or print it later",
        text: "The file sits on your phone or computer, ready to open in a kitchen with no signal or go to a printer another day.",
      },
    ],
    featureSections: [
      {
        heading: "The recipe is on page one",
        proof: "before-after",
        body:
          "RecipePrinter lays the recipe out on its own page before anything is saved, so there is nothing to scroll past. Save the same recipe straight from the site and the PDF is the whole article. One caprese pasta salad comes to twenty-six pages, with the recipe somewhere in the middle.",
      },
      {
        heading: "A recipe you can search",
        image: "pdf-search",
        body:
          "A screenshot is a picture of a recipe. You cannot search it, copy an amount out of it, or make it bigger without it turning blurry. A PDF from RecipePrinter is text. It prints crisp however large you make it, and you can search it for an ingredient the way you would search any other document.",
      },
    ],
    faqs: [
      {
        question: "Where is the download button?",
        answer:
          "It is in your browser's print dialog. Open that, choose Save as PDF instead of your printer, and the file lands wherever your downloads normally go. Every browser has it built in, so there is nothing to install.",
      },
      {
        question: "Can I put several recipes in one PDF?",
        answer:
          "Yes. Add as many recipes as you want and save them in one go, and they arrive as one file with a recipe on each page rather than as a folder of separate downloads.",
      },
      {
        question: "Can I make a PDF from a screenshot or a photo?",
        answer:
          "Yes. Upload a screenshot, a cookbook page, or a photo of an old recipe card. RecipePrinter reads the recipe out of the picture, and from there it saves exactly the way a link does.",
      },
      {
        question: "Will the PDF still open without internet?",
        answer:
          "Yes. Once it is saved it is a file on your device like any other, so it opens in a basement kitchen, on a plane, or years after the original page has gone.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/printable-recipe-card-generator", label: "Make recipe cards" },
    ],
  },
  {
    slug: "printable-recipe-card-generator",
    lastReviewed: "2026-09-02",
    primaryKeyword: "printable recipe card generator",
    secondaryKeywords: [
      "recipe card maker",
      "recipe card builder",
      "recipe card creator",
      "recipe card template",
      "printable recipe cards",
      "make recipe cards",
      "recipe card printer",
      "printable recipe cards 4x6",
      "print recipes on index cards",
    ],
    intent: "Utility SEO",
    eyebrow: "Recipe card maker",
    initialImportMode: "url",
    importSubmitLabel: "Make recipe card",
    title: "Free Printable Recipe Card Maker",
    description:
      "Make printable recipe cards from links, photos, screenshots, or text, including 4x6 and recipe-box-friendly layouts.",
    h1: "Printable recipe card generator",
    lede:
      "Whatever form the recipe is in, it comes back as a 6 by 4 card with the ingredients and steps already set, ready for the box.",
    howTo: [
      {
        name: "Add the recipe",
        text: "Paste a recipe link, drop in a photo of an old card, or paste the text. The ingredients and steps land where they belong.",
      },
      {
        name: "Switch to the card size",
        text: "In print setup, choose the 6 by 4 card instead of a full page. Every recipe waiting to print changes with it.",
      },
      {
        name: "Pick a theme",
        text: "Themes change the card's type, borders, and how the photo sits. Several are free, and the premium ones are a one-time purchase.",
      },
      {
        name: "Print and file it",
        text: "Turn on cut lines if you want a trim guide, print on card stock, and file the finished card in the box.",
      },
    ],
    featureSections: [
      {
        heading: "Sized for the box it's going in",
        image: "card-in-box",
        body:
          "A 6 by 4 card is the size a standard recipe box takes, so what comes off your printer drops straight into the box or an index-card binder. Cut lines give you a trim guide when you print on card stock, and the type stays large enough to read from across the counter.",
      },
      {
        heading: "Change the look, keep the recipe",
        image: "multi-themes",
        body:
          "A theme changes a card's type, its border, and how the photo sits, without touching the recipe underneath. Switch themes and every card in the batch follows, so a stack printed in one go still looks like a set rather than a pile of odds and ends.",
      },
    ],
    examples: ["caprese", "korean", "pesto"],
    faqs: [
      {
        question: "What should I print recipe cards on?",
        answer:
          "Card stock, if you want them to survive a kitchen. Feed 4x6 cards straight through a printer that takes them, or print on a letter sheet and cut the card out. Turn on cut lines and you get a dashed guide to trim along.",
      },
      {
        question: "What happens when a recipe is too long for one card?",
        answer:
          "It carries on onto the back of the same card instead of being cut short. Two-sided is on by default, so set your printer to print both sides flipped on the long edge and the front and back will line up.",
      },
      {
        question: "Can I fix a recipe before it prints?",
        answer:
          "Yes. The title, the ingredients, the steps, and the notes are editable right on the card, so you can correct an amount, drop a step you do not need, or add a note of your own before anything reaches the printer.",
      },
      {
        question: "Can I print a whole stack at once?",
        answer:
          "Yes. Add as many recipes as you like and print them in one job. The card size and the theme apply to every recipe waiting to print, so what comes out of the printer matches.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/recipe-binder", label: "Make a recipe binder" },
    ],
  },
  {
    slug: "print-pinterest-recipes",
    primaryKeyword: "print Pinterest recipes",
    secondaryKeywords: [
      "print recipe from Pinterest",
      "Pinterest recipe printer",
      "organize recipes from Pinterest",
      "save Pinterest recipes",
      "how to print Pinterest recipes from iPhone",
      "print Pinterest recipes without ads",
    ],
    intent: "Utility SEO",
    eyebrow: "Social recipe printer",
    initialImportMode: "url",
    importHint:
      "No clean recipe link on the pin? Paste the recipe text or upload a screenshot instead.",
    title: "Free Pinterest Recipe Printer",
    description:
      "Turn Pinterest recipe links, screenshots, or saved recipe text into printable recipe cards, pages, and PDFs.",
    h1: "Print Pinterest recipes",
    lede:
      "Pinterest is a great place to find recipes. RecipePrinter helps move the ones you want to make from a saved pin into a printable recipe you can cook from.",
    faqs: [
      {
        question: "How do I print Pinterest recipes from an iPhone?",
        answer:
          "Open the pin, use the original recipe link when Pinterest provides one, then paste that link into RecipePrinter. If the recipe is only visible in the pin or app, use a screenshot or paste the recipe text.",
      },
      {
        question: "Can I organize Pinterest recipes after printing?",
        answer:
          "Yes. Printed recipe cards and pages work well in binders, folders, and seasonal collections.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
    ],
  },
  {
    slug: "print-instagram-recipes",
    primaryKeyword: "print Instagram recipes",
    secondaryKeywords: [
      "print recipe from Instagram",
      "Instagram recipe printer",
      "save Instagram recipes",
      "print recipe from social media",
      "print recipe from Instagram Reels",
      "how to print recipes from Instagram Reels",
    ],
    intent: "Utility SEO",
    eyebrow: "Social recipe printer",
    initialImportMode: "url",
    importHint:
      "Reels and posts don't always give up their text. If the link won't import, paste the caption or upload a screenshot.",
    title: "Free Instagram Recipe Printer",
    description:
      "Turn Instagram recipe captions, screenshots, links, or pasted text into printable recipes you can cook from.",
    h1: "Print Instagram recipes",
    lede:
      "Instagram recipes and Reels are easy to save and hard to cook from. RecipePrinter helps turn recipe captions, screenshots, links, and pasted text into printable cards or pages.",
    faqs: [
      {
        question: "Can I print a recipe from an Instagram Reel?",
        answer:
          "Yes. Copy the Reel caption, notes, or source link when available, or upload screenshots of the recipe text. RecipePrinter will format the recipe into a printable card or page.",
      },
      {
        question: "Can I use a screenshot of an Instagram recipe?",
        answer:
          "Yes. Upload a screenshot when that is the easiest way to capture the recipe.",
      },
    ],
    links: [
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
    ],
  },
  {
    slug: "print-facebook-recipes",
    primaryKeyword: "print recipe from Facebook",
    secondaryKeywords: [
      "print recipes from Facebook",
      "how to print recipes from Facebook Reels",
      "print Facebook recipe on iPhone",
      "can you print recipes from Facebook",
    ],
    intent: "Utility SEO",
    eyebrow: "Social recipe printer",
    initialImportMode: "url",
    importHint:
      "Group posts often block importers. If the link won't import, paste the post's text or upload a screenshot.",
    title: "Free Facebook Recipe Printer",
    description:
      "Turn Facebook recipe posts, Reels, screenshots, links, or copied text into printable recipe cards, pages, and PDFs.",
    h1: "Print recipes from Facebook",
    lede:
      "Facebook recipes often show up in posts, group comments, Reels, captions, screenshots, and shared links. RecipePrinter helps turn the parts you can copy or capture into a printable recipe you can cook from.",
    faqs: [
      {
        question: "Can I print recipes from Facebook Reels?",
        answer:
          "Yes. Use the recipe text, caption, screenshots, or source link when available. RecipePrinter can format copied text or screenshots into a printable recipe card or page.",
      },
      {
        question: "What if Facebook will not let me copy the recipe?",
        answer:
          "Take screenshots of the recipe text or copy the source link if the creator included one. RecipePrinter can start from screenshots, photos, pasted text, or URLs.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-youtube-recipes", label: "Print YouTube recipes" },
    ],
  },
  {
    slug: "print-tiktok-recipes",
    primaryKeyword: "print TikTok recipes",
    secondaryKeywords: [
      "print recipe from TikTok",
      "TikTok recipe printer",
      "save TikTok recipes",
      "print recipe from social media",
      "print recipe from video",
    ],
    intent: "Utility SEO",
    eyebrow: "Social recipe printer",
    initialImportMode: "url",
    importHint:
      "A video has no page to read. If the link won't import, paste the caption or upload screenshots of the steps.",
    title: "Free TikTok Recipe Printer",
    description:
      "Turn TikTok recipe captions, screenshots, links, or pasted text into printable recipe cards, pages, and PDFs.",
    h1: "Print TikTok recipes",
    lede:
      "TikTok is good for finding quick recipe ideas. RecipePrinter helps turn the recipes you want to repeat into something stable enough to cook from.",
    faqs: [
      {
        question: "Can RecipePrinter print directly from TikTok?",
        answer:
          "Use the recipe text, caption, screenshots, or available source link. RecipePrinter will format the recipe into a printable card or page.",
      },
      {
        question: "Can I save TikTok recipes as PDFs?",
        answer:
          "Yes. Once the recipe is formatted, choose Save as PDF in your browser print dialog.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-youtube-recipes", label: "Print YouTube recipes" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
    ],
  },
  {
    slug: "print-youtube-recipes",
    primaryKeyword: "print recipe from YouTube",
    secondaryKeywords: [
      "how to print recipe from YouTube",
      "can you print recipes from YouTube",
      "print recipe from YouTube video",
      "save YouTube recipe as PDF",
    ],
    intent: "Utility SEO",
    eyebrow: "Video recipe printer",
    initialImportMode: "url",
    importHint:
      "The recipe usually lives in the description. If the link won't import, paste that text in instead.",
    title: "Free YouTube Recipe Printer",
    description:
      "Turn YouTube recipe descriptions, transcripts, screenshots, links, or copied notes into printable recipes.",
    h1: "Print a recipe from YouTube",
    lede:
      "YouTube recipes are helpful to watch and frustrating to cook from when the ingredients live in a description, transcript, pinned comment, or on-screen text. RecipePrinter helps turn the recipe details into a printable card or page.",
    faqs: [
      {
        question: "Can RecipePrinter extract a full recipe from any YouTube video?",
        answer:
          "Start with the written recipe details when they are available: the description, transcript, pinned comment, screenshots, or source link. If the video has no usable recipe text, you may need to paste your own notes.",
      },
      {
        question: "Can I save a YouTube recipe as a PDF?",
        answer:
          "Yes. Once the recipe details are formatted in RecipePrinter, choose Save as PDF in your browser print dialog.",
      },
    ],
    links: [
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
      { href: "/convert-recipe-to-pdf", label: "Convert recipe to PDF" },
    ],
  },
  {
    slug: "organize-recipes",
    captureHeading: "Start with one recipe",
    primaryKeyword: "organize recipes",
    secondaryKeywords: [
      "recipe organization ideas",
      "organize recipes from Pinterest",
      "recipe collection ideas",
      "how to save recipes",
    ],
    intent: "Organization SEO",
    eyebrow: "Recipe organization guide",
    title: "Organize Recipes from the Internet",
    description:
      "Turn scattered online recipes into printable cards, PDFs, binders, and collections you can cook from and keep.",
    h1: "Organize recipes from the internet",
    lede:
      "RecipePrinter helps turn scattered links, screenshots, saved posts, and copied text into a recipe collection you can cook from and keep.",
    faqs: [
      {
        question: "What is the easiest way to organize online recipes?",
        answer:
          "Start by printing or saving the recipes you actually cook, then group them by meals, seasons, family favorites, baking, holidays, or weeknight dinners.",
      },
      {
        question: "Can RecipePrinter help with recipe binders?",
        answer:
          "Yes. You can print letter-size recipe pages or recipe cards and file them in a binder or collection.",
      },
    ],
    links: [
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/printable-recipe-card-generator", label: "Printable recipe cards" },
    ],
  },
  {
    slug: "recipe-binder",
    captureHeading: "Start your binder",
    primaryKeyword: "recipe binder",
    secondaryKeywords: [
      "recipe binder ideas",
      "recipe binder printables",
      "recipe notebook ideas",
      "recipe organization ideas",
    ],
    intent: "Organization SEO",
    eyebrow: "Recipe binder guide",
    statusNote:
      "Coming soon: dedicated binder-building features. For now, RecipePrinter helps you create the printable pages, cards, and PDFs that can go into a binder.",
    title: "Recipe Binder Ideas for Online Recipes",
    description:
      "Build a recipe binder from online recipes, printable recipe cards, PDFs, screenshots, and family favorites.",
    h1: "Recipe binder ideas for recipes you find online",
    lede:
      "A recipe binder is still one of the simplest ways to keep favorite recipes close. RecipePrinter helps turn online recipes into printable pages, cards, and PDFs you can file now, with more binder-specific tools coming soon.",
    faqs: [
      {
        question: "Should a recipe binder use cards or full pages?",
        answer:
          "Both can work. Full pages are easiest for long recipes, while cards are nice for short favorites, baking, and gifts.",
      },
      {
        question: "Can I make a binder from recipes I found online?",
        answer:
          "Yes. RecipePrinter formats online recipes into printable pages and cards that can be filed in a physical binder. A dedicated binder-building workflow is planned.",
      },
    ],
    links: [
      { href: "/organize-recipes", label: "Organize recipes" },
      { href: "/printable-recipe-card-generator", label: "Printable recipe cards" },
      { href: "/family-recipe-book", label: "Family recipe book ideas" },
    ],
  },
  {
    slug: "preserve-family-recipes",
    captureHeading: "Start with one card",
    primaryKeyword: "preserve family recipes",
    secondaryKeywords: [
      "handwritten recipe preservation",
      "recipe keepsake",
      "family recipe book ideas",
      "recipe memory book",
    ],
    intent: "Preservation and Gift SEO",
    // Preservation by intent, but the thing someone wants here is to photograph
    // the card in their hand, so capture stays in the hero.
    layout: "capture-first",
    heroImage: "handwritten-card",
    eyebrow: "Family recipe guide",
    initialImportMode: "image",
    importSubmitLabel: "Make a printable copy",
    title: "Preserve Family Recipes",
    description:
      "Preserve family recipes by turning old cards, photos, screenshots, and text into printable keepsakes and a bound family cookbook.",
    h1: "Preserve family recipes",
    lede:
      "Keep the handwritten card and keep cooking from it. Photograph it and RecipePrinter reads it into a clean printable recipe, so the original can stay wherever you keep it while their recipe stays in the kitchen.",
    howTo: [
      {
        name: "Photograph the card",
        text: "Lay it flat, get all four corners in frame, and upload the photo. Screenshots and typed-out recipes work the same way.",
      },
      {
        name: "Look it over",
        text: "Some of it will come through perfectly and some will want a second look. Every line is editable, so you can correct anything before you print.",
      },
      {
        name: "Print the working copy",
        text: "A 6 by 4 card for the box or a letter page for the binder. The copy goes in the kitchen, and the original stays where it is.",
      },
      {
        name: "Gather them when you are ready",
        text: "Once there are enough, they can become a bound cookbook with a cover, chapters and a table of contents.",
      },
    ],
    featureSections: [
      {
        heading: "Keep the original, cook from the copy",
        image: "handwritten-card",
        body:
          "A printed copy does the kitchen work: the counter, the splashes, the folding into a binder, the stuck-to-the-fridge afternoons. The handwritten card stays wherever you keep it, exactly as it is. You are still cooking their recipe every time you use the copy.",
      },
      {
        heading: "The handwriting comes along",
        image: "card-in-box",
        body:
          "Keep the photo of the card on the recipe, beside the typed version. The measurements end up in type you can read from across a kitchen, and the hand they were written in is still on the page, which is usually the part that matters most.",
      },
    ],
    faqs: [
      {
        question: "Will it read my grandmother's handwriting?",
        answer:
          "Usually, though not always. Cursive, faded pencil and a stained corner are all genuinely hard to read. Whatever does come through lands in an editable recipe, so at worst you are correcting a few lines rather than typing the whole card.",
      },
      {
        question: "What if the card is too faded to read?",
        answer:
          "Type it in instead. The recipe still gets the same clean page, the same card or letter layout, and the same place in a cookbook later.",
      },
      {
        question: "Can I keep who it came from?",
        answer:
          "Yes. A recipe carries a note of its own, which is where the name goes, or the year, or the fact that they never actually measured the vanilla.",
      },
      {
        question: "Do these have to become a cookbook?",
        answer:
          "No. Printing one card and stopping is a complete use of this. The bound book with a cover and chapters is there if you want it, at $19.99 once for that book.",
      },
    ],
    links: [
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/printable-recipe-card-generator", label: "Make recipe cards" },
    ],
  },
  {
    slug: "family-recipe-book",
    // Guide intent, but the input belongs at the top like everywhere else: a
    // book starts with one recipe, and asking for it below three sections of
    // explanation buried the only thing there is to do.
    layout: "capture-first",
    heroImage: "bound-cookbook",
    primaryKeyword: "family recipe book",
    secondaryKeywords: [
      "create a family cookbook",
      "family cookbook printing",
      "recipe memory book",
      "custom cookbook",
    ],
    intent: "Preservation and Gift SEO",
    eyebrow: "Family recipe guide",
    title: "Family Recipe Book Ideas",
    description:
      "Create a family recipe book from printed recipes, old cards, online favorites, photos, and kitchen notes.",
    h1: "Family recipe book ideas",
    lede:
      "A family recipe book can start with one recipe. RecipePrinter turns online recipes, old cards, photos, and typed-in notes into clean, matching pages, then binds them into a cookbook with a cover, chapters, and a table of contents.",
    importSubmitLabel: "Start the book",
    captureReassurance: false,
    importHint: "One recipe is enough to begin. The book grows from there.",
    howTo: [
      {
        name: "Gather the recipes",
        text: "Bring together the recipes you want to keep: paste links, photograph old handwritten cards, upload screenshots, or type in the ones that only live in someone's head.",
      },
      {
        name: "Clean up each page",
        text: "RecipePrinter sets every recipe on a clear, consistent page, so a faded card and a copied text end up looking like they belong in the same book.",
      },
      {
        name: "Organize into chapters",
        text: "Group them into chapters like breakfasts, mains, and holiday baking, and add a cover and a dedication.",
      },
      {
        name: "Print at home or send to a printer",
        text: "Print the finished cookbook on your home printer, or export it and order a bound copy from a professional printer to give as a gift.",
      },
    ],
    featureSections: [
      {
        heading: "Different sources, one consistent book",
        proof: "photo",
        body:
          "Family recipes arrive in every format: a stained index card, a screenshot from a group chat, a link a cousin sent, a method that only lives in someone's head. RecipePrinter reads each one and sets it on a clean, consistent page, so a card from 1975 and a text from last week look like they belong in the same book instead of a pile of mismatched scraps.",
      },
      {
        heading: "Keep the details that make it yours",
        proof: "book",
        body:
          "A good family cookbook is as much about the people as the food. Keep a note about who a recipe came from, the substitution that makes it work, and the holiday it belongs to. Place a photo of the dish, the cook, or the original handwritten card next to the clean typed version, so the story and the exact wording survive alongside the measurements.",
      },
      {
        heading: "Print one at home, or a bound copy for everyone",
        proof: "book",
        body:
          "Print a copy on your home printer to flip through and check, then export a print-ready file to order bound books from a professional printer. A finished cookbook makes a keepsake gift for a wedding, a milestone birthday, or the holidays, and everyone who cooks from it gets their own copy in the kitchen.",
      },
    ],
    faqs: [
      {
        question: "How many recipes make a book?",
        answer:
          "Whatever you have. Eight recipes bound with a cover is a real gift, and so is forty. The table of contents renumbers itself as you add, so the size is never something you settle before you start.",
      },
      {
        question: "Can other people in the family add theirs?",
        answer:
          "Not directly, there is no invite link. What works is people sending you the recipe however they have it, a photo of a card, a screenshot, a text, and you adding it. Most of them arrive that way anyway.",
      },
      {
        question: "How do I actually get it printed and bound?",
        answer:
          "Two ways. Print it at home on the Letter layout, set up for a spiral or 3-ring binder, or export the file and hand it to a print shop, where the 8 by 10 hardcover layout gives them what a case-bound book needs. Any of these will work from it.",
        links: Object.values(PRINTERS).map((printer) => ({
          href: printer.url,
          label: printer.name,
          note: printer.note,
        })),
      },
      {
        question: "What does a cookbook cost?",
        answer:
          "$19.99 once for the book, and that book stays yours to edit and add to afterwards. After that it is whatever the printing costs: paper and ink at home, or whatever the print shop charges.",
      },
    ],
    links: [
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/organize-recipes", label: "Organize recipes" },
    ],
  },
  {
    slug: "just-the-recipe-alternative",
    lastReviewed: "2026-09-02",
    primaryKeyword: "Just the Recipe alternative",
    // Deliberately narrow. This page used to also claim "print recipe without
    // ads" and "print recipe from website", both of which are other pages'
    // primaries, so three pages were bidding for the same two queries and the
    // thinnest of them was this one. It competes on the brand query only.
    secondaryKeywords: [
      "Just the Recipe alternative",
      // The run-together spelling is how their domain reads and how a good
      // share of people type it, so it stays reachable as a query. It is a
      // keyword only: their name is never SET that way anywhere on the page.
      "justtherecipe alternative",
      "alternative to Just the Recipe",
      "Just the Recipe app alternative",
      "free recipe printing tool",
    ],
    intent: "Utility SEO",
    eyebrow: "Recipe tool comparison",
    initialImportMode: "url",
    title: "Just the Recipe Alternative for Printing",
    description:
      "Comparing RecipePrinter and Just the Recipe: both clean up a recipe page, and they differ on printing, what you can bring in, and what the free tier does.",
    h1: "A Just the Recipe alternative built for printing",
    lede:
      "Paste a recipe link into either one and you get the ingredients and steps without the backstory. The difference comes next: Just the Recipe keeps it on your screen, RecipePrinter puts it on paper.",
    featureSections: [
      {
        heading: "The same first step, a different second one",
        proof: "before-after",
        body:
          "Just the Recipe keeps the cleaned-up recipe on a screen, with serving adjustments and printing on its Premium plan. RecipePrinter is built for the paper end of it: a card for the box, a full page for the binder, or a batch of both for the week, printed free without an account.",
      },
      {
        heading: "Recipes that never had a link",
        image: "handwritten-card",
        body:
          "Plenty of what you cook never had a URL: a handwritten card, a screenshot from a group chat, a paragraph someone texted you. RecipePrinter reads those the way it reads a link, so they end up on the same printed page as the ones that came off a website.",
      },
      {
        heading: "Card or page, cut lines, several at once",
        image: "card-in-box",
        body:
          "Choose a 6 by 4 card sized for a recipe box or a full letter page, pick a theme, turn on cut lines for card stock, and print several recipes in one job. Printing is free and works without an account, so you can try it on the recipe you were about to print anyway.",
      },
    ],
    comparison: {
      competitor: "Just the Recipe",
      checked: "September 2026",
      groups: [
        {
          title: "Getting recipes in",
          rows: [
            // Kept even though both sides tick it. Opening on the thing both
            // tools do says the table is a comparison rather than a pitch, and
            // it is the row a reader checks first.
            { feature: "From a recipe link", us: true, them: true },
            { feature: "Reading a recipe out of a photo", us: true, them: false },
            { feature: "From text you paste in", us: "Read and laid out for you", them: "Typed into a form yourself" },
            { feature: "An old handwritten card", us: "Take a photo of it", them: "Type it in yourself" },
          ],
        },
        {
          title: "Printing",
          rows: [
            { feature: "Printing a recipe", us: "Free, no account", them: "Paid plan" },
            { feature: "Recipe card sizes and themes", us: true, them: false },
            { feature: "Cut lines for card stock", us: true, them: false },
            { feature: "Printing several recipes in one job", us: true, them: false },
          ],
        },
        {
          title: "Keeping them",
          rows: [
            { feature: "Saving recipes to come back to", us: "Unlimited with a free account", them: "20 free, then paid" },
            { feature: "Bound cookbook with a cover and chapters", us: "$19.99 once, edits included", them: false },
          ],
        },
        {
          title: "In the kitchen",
          rows: [
            { feature: "Using it on a phone", us: "Any browser, no install", them: "Web, plus iOS and Android apps" },
          ],
        },
      ],
    },
    faqs: [
      {
        question: "How do I choose between them?",
        answer:
          "By where the recipe ends up. If you cook from a screen, that is what Just the Recipe does. If it ends up on paper, in a card box or a binder, that is what RecipePrinter does.",
      },
      {
        question: "What does each one cost?",
        answer:
          "Just the Recipe is free to read recipes and to save up to 20; printing, unlimited saves and serving adjustments are on Premium. RecipePrinter is free to print, with no account and no limit, and sells premium themes and the cookbook builder as one-time purchases.",
      },
      {
        question: "Can I bring my saved Just the Recipe recipes over?",
        answer:
          "Not directly. There is no export from Just the Recipe that RecipePrinter can read, so the quickest route is pasting the original links in again. Paprika export files and CookPilot libraries do come straight across.",
      },
      {
        question: "Does RecipePrinter have an app?",
        answer:
          "No. It runs in any browser, on a phone as readily as a computer, so there is nothing to install and nothing to sign into before you print.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print a recipe from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/printable-recipe-card-generator", label: "Make printable recipe cards" },
    ],
  },
  {
    slug: "reciscan-alternative",
    lastReviewed: "2026-09-02",
    primaryKeyword: "ReciScan alternative",
    secondaryKeywords: [
      "recipe scanner alternative",
      "recipe card maker",
      "preserve family recipes",
      "family recipe book ideas",
    ],
    intent: "Preservation and Gift SEO",
    // Preservation by intent, but someone searching a competitor's name wants
    // to try the thing now, so capture stays in the hero like the other
    // alternative page rather than waiting below an explanation.
    layout: "capture-first",
    eyebrow: "Recipe preservation alternative",
    title: "ReciScan Alternative",
    description:
      "Comparing RecipePrinter and ReciScan: both read old recipe cards, and they differ on what comes out, what it costs, and how long it takes.",
    h1: "A ReciScan alternative that prints today",
    lede:
      "Both read links, photos and pasted text. ReciScan turns them into a bound book and ships it to you. RecipePrinter gives you the pages: print them now, keep the PDF, or take the file to a print shop.",
    featureSections: [
      {
        heading: "A card, a page, or the whole book",
        proof: "card",
        body:
          "ReciScan ends in a bound book from its own press, starting at $18 for fifty pages. RecipePrinter hands you the file: a 6 by 4 card for the box by the stove, a letter page for a binder, or a bound cookbook with a cover and chapters. Printing one card tonight does not rule out the book.",
      },
      {
        heading: "Nothing to install",
        image: "mobile-vs-desktop",
        body:
          "ReciScan is an app you download to a phone. RecipePrinter is a web page, so a link, a photo or a block of pasted text becomes a printable recipe in the same browser you are reading this in, without an install or an account.",
      },
    ],
    comparison: {
      competitor: "ReciScan",
      checked: "September 2026",
      groups: [
        {
          title: "Getting recipes in",
          rows: [
            { feature: "Links, photos, pasted text, handwritten cards", us: true, them: true },
          ],
        },
        {
          title: "What you can print",
          rows: [
            { feature: "A 6 by 4 card for a recipe box, with cut lines", us: true, them: false },
            { feature: "A full letter page for a binder", us: true, them: false },
            { feature: "Printing it yourself", us: "Free, no account", them: true },
          ],
        },
        {
          title: "Making a book",
          rows: [
            { feature: "A cookbook you print or export yourself", us: "$19.99 once", them: "PDF download" },
            { feature: "Spiral or hardcover layout", us: "Letter spiral, 8 by 10 hardcover", them: "Coil, saddle stitch, perfect bound, hardcover" },
            { feature: "Updating the book you paid for", us: "Free, any time", them: false },
          ],
        },
        {
          title: "Getting started",
          rows: [
            { feature: "What you have to install", us: "Nothing, any browser", them: "The iPhone or Android app" },
            { feature: "What it costs to start", us: "Free, no account", them: "Free app, $4.99 a month for extras" },
          ],
        },
      ],
    },
    faqs: [
      {
        question: "How do I choose between them?",
        answer:
          "By what you want at the end. If it is one bound book of the whole collection, ReciScan prints and ships that. If it is recipes on paper you can cook from this week, in a box or a binder, that is RecipePrinter.",
      },
      {
        question: "What does each one cost?",
        answer:
          "ReciScan is free to use, with a $4.99 monthly subscription for covers and extras, and printed books starting at $18. RecipePrinter is free to print. Premium themes are $1.99 once, a cookbook is $19.99 once, and both stay yours rather than renewing every month.",
      },
      {
        question: "Can RecipePrinter send me a printed book?",
        answer:
          "Not directly. It builds the finished book as a print-ready file: run it on a home printer, keep the PDF, or take it to a print shop to have bound. A copy shop works from the same file if you would rather not print it yourself.",
      },
      {
        question: "What if I only want a few recipes, not a whole book?",
        answer:
          "You can. There is no minimum and nothing to finish: print one card, print three, come back in a month. The cookbook is there when you want it, and not before.",
      },
    ],
    links: [
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/family-recipe-book", label: "Family recipe book ideas" },
    ],
  },
];

export const SEO_LANDING_PAGE_MAP = new Map(
  SEO_LANDING_PAGES.map((page) => [page.slug, page]),
);

/** The layout template a page renders with (explicit override, else by intent). */
export function layoutForPage(page: SeoLandingPage): "capture-first" | "guide-first" {
  return page.layout ?? (page.intent === "Utility SEO" ? "capture-first" : "guide-first");
}

export function seoLandingPageMetadata(page: SeoLandingPage): Metadata {
  return pageMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
  });
}
