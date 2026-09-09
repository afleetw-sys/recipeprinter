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
  /**
   * The day this page's rendered content last changed (YYYY-MM-DD), and what
   * <lastmod> is built from.
   *
   * Separate from `lastReviewed` because the two are different facts and were
   * drifting apart the moment anything was edited: `lastReviewed` means a human
   * read the page end to end and signed it off, so bumping it to refresh a
   * sitemap date would claim a sign-off that never happened, and leaving it
   * alone told Google a page rewritten today was last touched in July. Edit
   * copy, set this. Read the page through and approve it, set the other.
   */
  contentUpdated?: string;
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
  statusNote?: string;
  initialImportMode?: ImportTab;
  importSubmitLabel?: string;
  /** A FEATURE_IMAGES key for the hero photo, when the page's subject is not
      one of the printed cards. Without it every utility page opens on the same
      card. */
  heroImage?: string;
  /** The little label on the hero photo. Only read when `heroImage` is set —
      the built-in captions describe the printed cards, and a page showing
      something else should not inherit one. Omit for no label. */
  heroAnnotation?: string;
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
  /**
   * Link text other pages use when they point here. Anchor text is one of the
   * signals Google reads to decide what a page is about, so a link that says
   * "Free Printable Recipe Card Maker" spends its whole budget on "Free" and
   * "Maker" and never says "printer" — the word people actually search.
   *
   * Defaults to `h1`, which is already written as the natural phrase for the
   * page's job. Set this only when the h1 is too long to read as a link, or
   * when it misses the term the page is trying to win.
   */
  anchor?: string;
  /**
   * What this page is, in the fewest words a reader needs to pick it out of a
   * list: "Pinterest", "A PDF", "A binder".
   *
   * A picker of ten links all reading "Print a recipe from…" is a wall of page
   * titles, and the reader has to parse every one to find the difference. The
   * card leads with this and keeps `anchor` underneath, so the link still says
   * the searchable phrase without making the reader wade through it.
   */
  shortLabel?: string;
  /**
   * Which picker this page belongs in. `intent` cannot answer this: it drives
   * the page's own layout, and it filed the Just the Recipe comparison under
   * "Utility SEO", which put a competitor page in the list of ways you might
   * have found a recipe.
   */
  pickerGroup?: "source" | "output" | "comparison";
  lede: string;
  /** One-sentence emotional hook opening the content scaffold. */
  intro?: string;
  /**
   * Render the shared cookbook section (components/seo/CookbookPitch).
   *
   * On for the pages that print a stack of recipes and stopped there: from a
   * website, onto cards, into a binder, organized into collections. Those are
   * the pages where a bound book is the natural next step, and they were the
   * ones never mentioning it. Leave it off where the page already argues the
   * cookbook itself, or the same claim lands twice.
   */
  cookbookPitch?: boolean;
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
    contentUpdated: "2026-09-09",
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
    cookbookPitch: true,
    shortLabel: "A website or blog",
    pickerGroup: "source",
    intent: "Utility SEO",
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
          "Most recipe sites keep a tidy copy of the recipe for search engines to read. RecipePrinter takes that copy, so the amounts and the steps arrive the way the site wrote them rather than being picked out of the words on the page.",
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
          "Yes. Add as many recipes as you want and print them as one job. That is the difference between seven trips to the printer and one, which is most of the point when you're printing a week of dinners at once.",
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
      { href: "/just-the-recipe-alternative", label: "Just the Recipe alternative" },
      { href: "/convert-recipe-to-pdf", label: "Convert a recipe to PDF" },
    ],
  },
  {
    slug: "print-recipe-without-ads",
    contentUpdated: "2026-09-09",
    lastReviewed: "2026-09-02",
    primaryKeyword: "print recipe without ads",
    secondaryKeywords: [
      "print recipe without pictures",
      "print recipe from website without ads",
      "clean printable recipe",
      "print recipe without clutter",
    ],
    shortLabel: "Pages without ads",
    pickerGroup: "output",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Print Recipes Without Ads",
    description:
      "Turn cluttered recipe pages into clean printable recipes without ads, pop-ups, comments, or wasted pages. Free, and no account needed to print.",
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
        name: "Take out what you don't need",
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
          "A card asks nothing of you: no unlocking, no charging, no signal. It props against the backsplash and stays on the step you're on. Nobody scrolls back up to check whether it was two teaspoons or two tablespoons.",
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
          "Usually one sheet. A recipe prints as a single 4 by 6 card or a single letter page, however long the article it came from happened to be.",
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
    contentUpdated: "2026-09-09",
    lastReviewed: "2026-09-02",
    primaryKeyword: "convert recipe to PDF",
    secondaryKeywords: [
      "recipe PDF generator",
      "save recipe as PDF",
      "recipe to PDF",
      "printable recipe PDF",
      "save online recipe as PDF",
    ],
    cookbookPitch: true,
    shortLabel: "A PDF",
    pickerGroup: "output",
    intent: "Utility SEO",
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
        text: "Choose a 4 by 6 card or a full letter page. Whichever you pick is the shape the PDF comes out in.",
      },
      {
        name: "Choose Save as PDF",
        text: "Open your browser's print dialog and choose Save as PDF instead of a printer. There's no plugin to install and no account to make.",
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
          "RecipePrinter lays the recipe out on its own page before anything is saved, so there's nothing to scroll past. Save the same recipe straight from the site and the PDF is the whole article. One caprese pasta salad comes to twenty-six pages, with the recipe somewhere in the middle.",
      },
      {
        heading: "A recipe you can search",
        image: "pdf-search",
        body:
          "A screenshot is a picture of a recipe. You can't search it, copy an amount out of it, or make it bigger without it turning blurry. A PDF from RecipePrinter is text. It prints crisp however large you make it, and you can search it for an ingredient the way you would search any other document.",
      },
    ],
    faqs: [
      {
        question: "Where is the download button?",
        answer:
          "It's in your browser's print dialog. Open that, choose Save as PDF instead of your printer, and the file lands wherever your downloads normally go. Every browser has it built in, so there's nothing to install.",
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
          "Yes. Once it's saved it's a file on your device like any other, so it opens in a basement kitchen, on a plane, or years after the original page has gone.",
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
    contentUpdated: "2026-09-09",
    lastReviewed: "2026-09-09",
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
    cookbookPitch: true,
    shortLabel: "Recipe cards",
    pickerGroup: "output",
    intent: "Utility SEO",
    initialImportMode: "url",
    importSubmitLabel: "Make recipe card",
    title: "Free Recipe Card Printer and Maker",
    description:
      "A recipe card maker and printer: turn links, photos, screenshots, or text into printable recipe cards, including 4x6 and recipe-box-friendly layouts.",
    h1: "Printable recipe card generator",
    // "recipe card printer" is the phrase this page's traffic actually arrives
    // on, and it is the one word the h1 and title both leave out.
    anchor: "Recipe card printer",
    lede:
      "Whatever form the recipe is in, it comes back as a 4 by 6 card with the ingredients and steps already set, ready for the box.",
    howTo: [
      {
        name: "Add the recipe",
        text: "Paste a recipe link, drop in a photo of an old card, or paste the text. The ingredients and steps land where they belong.",
      },
      {
        name: "Switch to the card size",
        text: "In print setup, choose the 4 by 6 card instead of a full page. Every recipe waiting to print changes with it.",
      },
      {
        name: "Pick a theme",
        text: "Themes change the card's type, borders, and how the photo sits. Several are free, and the premium ones are a one-off purchase each.",
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
          "A 4 by 6 card is the size a standard recipe box takes, so what comes off your printer drops straight into the box or an index-card binder. Cut lines give you a trim guide when you print on card stock, and the type stays large enough to read from across the counter.",
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
          "The rest prints on the back of the same card instead of being cut short. Two-sided is on by default, so set your printer to print both sides flipped on the long edge and the front and back will line up.",
      },
      {
        question: "Can I fix a recipe before it prints?",
        answer:
          "Yes. The title, the ingredients, the steps, and the notes are editable right on the card, so you can correct an amount, drop a step you don't need, or add a note of your own before anything reaches the printer.",
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
    // No lastReviewed: written today, not read through yet.
    slug: "print-recipe-from-photo",
    contentUpdated: "2026-09-09",
    primaryKeyword: "print a recipe from a photo",
    secondaryKeywords: [
      "print recipe from photo",
      "digitize handwritten recipes",
      "scan recipe cards",
      "print recipe from screenshot",
      "recipe card scanner",
      "photo of a recipe to printable",
      "type up handwritten recipes",
    ],
    shortLabel: "A photo or screenshot",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "image",
    importSubmitLabel: "Read the photo",
    // The template's default hero is a card captioned "Printed from a recipe
    // link", which is the one thing this page is not about.
    heroImage: "counter-card",
    heroAnnotation: "Printed from a photograph",
    cookbookPitch: true,
    title: "Print a Recipe from a Photo",
    description:
      "Photograph a handwritten card, a cookbook page, or a screenshot and RecipePrinter reads the recipe out of it and sets it for paper.",
    h1: "Print a recipe from a photo",
    anchor: "Print a recipe from a photo",
    lede:
      "A recipe box full of handwriting, a cookbook page you cannot take to the counter, a screenshot of a Reel. Photograph it and it comes back as a card you can print.",
    howTo: [
      {
        name: "Photograph the recipe",
        text: "Flat, in good light, close enough that the writing is legible. A phone camera is plenty; you are not scanning it, just letting the words be read.",
      },
      {
        name: "Upload it",
        text: "Drop the picture into the box above. Up to four images at a time, so a card with writing on the back goes in as one recipe. Photos straight off an iPhone are converted on the way in.",
      },
      {
        name: "Read it over",
        text: "The ingredients and the method come back as text you can edit. Handwriting is the hard case, so this is the moment to fix a word rather than after it prints.",
      },
      {
        name: "Print it or keep the PDF",
        text: "A 4 by 6 card for the recipe box, or a letter page for a binder. Save as PDF instead if you want the typed copy on your phone.",
      },
    ],
    featureSections: [
      {
        heading: "The handwriting stays, the fading does not",
        image: "handwritten-card",
        body:
          "An index card in someone's hand is the recipe and the person at once, and it is also thirty years of kitchen wear. Photographing it gives you a copy that does not fade, does not tear, and does not live in one box in one house. The original goes back where it was.",
      },
      {
        heading: "A typed copy is a copy you can use",
        image: "card-in-box",
        body:
          "A photograph of a recipe is a picture. You cannot search it, copy an amount out of it, or scale it. Read into text it becomes a recipe again: editable, printable at the size you want, and ready to go into a binder or a cookbook with the rest.",
      },
    ],
    faqs: [
      {
        question: "Does it read handwriting?",
        answer:
          "It does, and neat writing goes better than a scrawl. Faded pencil and looping cursive are the hard cases, so read the card over before you print and fix any line that came through wrong.",
      },
      {
        question: "What if the recipe runs onto the back of the card?",
        answer:
          "Photograph both sides and upload them together. Up to four images go in as one recipe, which also covers a cookbook page that spreads across two.",
      },
      {
        question: "Do I need to scan it properly?",
        answer:
          "No. A phone photo taken flat in decent light is enough. A scanner is not going to help much beyond that, and it is a lot more work per card.",
      },
      {
        question: "What happens to the photo afterwards?",
        answer:
          "Nothing you did not ask for. The recipe is what gets kept; the picture was only the way in.",
      },
    ],
    links: [
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/reciscan-alternative", label: "ReciScan alternative" },
      { href: "/printable-recipe-card-generator", label: "Recipe card printer" },
      { href: "/family-recipe-book", label: "Build a family cookbook" },
    ],
  },
  {
    slug: "print-pinterest-recipes",
    contentUpdated: "2026-09-09",
    lastReviewed: "2026-09-07",
    primaryKeyword: "print Pinterest recipes",
    secondaryKeywords: [
      "print recipe from Pinterest",
      "Pinterest recipe printer",
      "organize recipes from Pinterest",
      "save Pinterest recipes",
      "how to print Pinterest recipes from iPhone",
      "print Pinterest recipes without ads",
    ],
    cookbookPitch: true,
    shortLabel: "Pinterest",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    captureReassurance: false,
    importHint:
      "If a pin won't import, paste the recipe text or upload a screenshot instead.",
    title: "Free Pinterest Recipe Printer",
    description:
      "Turn Pinterest recipe links, screenshots, or saved recipe text into printable recipe cards, pages, and PDFs.",
    h1: "Print Pinterest recipes",
    lede:
      "RecipePrinter moves the recipes you actually want to make off the board and onto a printable card you can cook from.",
    howTo: [
      {
        name: "Copy the pin's link",
        text: "Open the pin, tap Share, and choose Copy link. That's the pin's own link, and it's the only one you need.",
      },
      {
        name: "Paste it in",
        text: "Paste the link into the box above. When the pin links out to a recipe, RecipePrinter follows it and reads the recipe from there.",
      },
      {
        name: "Pick a card or a page",
        text: "A 4 by 6 card for the recipe box, or a letter page for long bakes. Edit any line, and keep or drop the photo.",
      },
      {
        name: "Print it or save it as a PDF",
        text: "Send it to your printer, or choose Save as PDF in the print dialog to keep a copy on your phone.",
      },
    ],
    featureSections: [
      {
        heading: "A pin points at a recipe blog, and blogs are built for screens",
        proof: "before-after",
        body:
          "A recipe post is made to be scrolled: the photo, the story behind the dish, the notes, the comments, and the recipe itself somewhere down the page. None of that is a problem until you hit print. One of those pages, sent straight to the printer, ran to 26 sheets. RecipePrinter reads the page and keeps the part you cook from: the ingredients with their amounts, the numbered steps, the times, and the servings.",
      },
      {
        heading: "The pin itself is enough",
        image: "steps",
        body:
          "Plenty of pins never link out to a recipe at all. Some have it typed into the description, and some have it only in the image. Paste the pin's link either way. RecipePrinter follows the link when there's one, reads the description when there'sn't, and reads the pin's own image when that's all there is.",
      },
      {
        heading: "A board is for saving, a card is for cooking",
        image: "counter-card",
        body:
          "A board is a good place to collect recipes and an awkward place to cook from. The screen sleeps, your hands are wet, and you lose your place scrolling back up to the ingredients. A printed card sits on the counter and stays where you left it. Afterwards it goes in a recipe box, a binder, a folder by the stove, or later a bound cookbook.",
      },
    ],
    faqs: [
      {
        question: "How do I print Pinterest recipes from an iPhone?",
        answer:
          "Open the pin in the Pinterest app, tap Share, and choose Copy link. Paste that into RecipePrinter in your phone browser and set the card up there, then use the phone's print dialog to reach a wireless printer, or choose Save as PDF and print it from a computer later.",
      },
      {
        question: "Do I have to connect my Pinterest account?",
        answer:
          "No. RecipePrinter never asks for access to your account or your boards. It works from a link you paste, a screenshot you upload, or text you copy across, so nothing is connected and nothing is synced.",
      },
      {
        // Deliberately not "what if the pin has no link", which is the feature
        // row above word for word. The durable-copy argument is the different
        // point, and dead pins are the version of it Pinterest visitors have
        // already run into.
        question: "Why are so many of my older pins dead links?",
        answer:
          "Blogs move, close, or get reorganised, and the pin keeps its photograph long after the recipe behind it is gone. A printed card doesn't depend on any of that. Once it's in the box, it stays whatever happens to the site it came from.",
      },
      {
        question: "Can I print a whole board at once?",
        answer:
          "You add the pins one at a time, and then print them together as a single job. So it's not one paste, but it is one trip to the printer instead of fifteen, and the card size and theme apply to every recipe waiting to print.",
      },
      {
        question: "Will the printed card still show where the recipe came from?",
        answer:
          "It can, and that's your call: print the original link on the card or leave it off. The link kept with the recipe is the recipe page's when the pin leads to one, and the pin's own when it doesn't.",
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
    contentUpdated: "2026-09-09",
    primaryKeyword: "print Instagram recipes",
    secondaryKeywords: [
      "print recipe from Instagram",
      "Instagram recipe printer",
      "save Instagram recipes",
      "print recipe from social media",
      "print recipe from Instagram Reels",
      "how to print recipes from Instagram Reels",
    ],
    shortLabel: "Instagram",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Free Instagram Recipe Printer",
    description:
      "Paste an Instagram post or Reel link and turn the recipe in the caption into a printable recipe card, page, or PDF.",
    h1: "Print Instagram recipes",
    lede:
      "Instagram recipes are quick to save and hard to cook from. Paste the post's link and RecipePrinter turns it into a card you can put on the counter.",
    howTo: [
      {
        name: "Copy the post's link",
        text: "Open the post or the Reel, tap Share, and choose Copy link. It works the same for a single photo, a carousel, or a Reel.",
      },
      {
        name: "Paste it in",
        text: "Paste the link into the box above. RecipePrinter opens the post and reads the caption, which is where the recipe almost always is.",
      },
      {
        name: "Choose a card or a page",
        text: "A 4 by 6 card for the recipe box, or a letter page if the caption runs long. Edit any line before it prints.",
      },
      {
        name: "Print it or save it as a PDF",
        text: "Send it to a printer, or choose Save as PDF in the print dialog so it's on your phone the next time you make it.",
      },
    ],
    featureSections: [
      {
        heading: "The recipe is in the caption, under the video",
        image: "steps",
        body:
          "A Reel shows you the dish in thirty seconds and puts the recipe in the caption underneath, folded behind a more link. Cooking from it means tapping back to the post, opening the caption again, and finding your place every time your hands are free. RecipePrinter reads that caption and sets it out as ingredients with their amounts and numbered steps, on one sheet that doesn't scroll.",
      },
      {
        heading: "Saved posts are a pile, not a collection",
        image: "card-in-box",
        body:
          "The save button is quick, which is also its limit: recipes land in the same place as everything else you meant to come back to, with nothing to search on and no way to tell one pasta from another. A printed card is filed the moment it comes off the printer, in a recipe box, a binder, or a folder by the stove.",
      },
      {
        heading: "Carousels, and the answer buried in the comments",
        image: "paste-in-app",
        body:
          "Some creators spread a recipe across a carousel, and the substitution everyone asks about is usually answered further down in the comments. Anything you can copy can go in as text, so the swap that only exists in a reply ends up on the sheet you actually cook from.",
      },
    ],
    faqs: [
      {
        question: "Can I print a recipe from an Instagram Reel?",
        answer:
          "Yes. Copy the Reel's link and paste it in. A Reel's recipe is nearly always written into the caption below it, and that is the part RecipePrinter reads.",
      },
      {
        question: "Do I have to connect my Instagram account?",
        answer:
          "No. RecipePrinter never asks for access to your account, your saved posts, or who you follow. It works from a link you paste, so nothing is connected and nothing is synced.",
      },
      {
        question: "Will the card credit the creator?",
        answer:
          "It can, and that's your call. The post's link can print on the card, so the person whose recipe it is stays attached to it and the Reel is easy to find again.",
      },
      {
        question: "Can I print several Instagram recipes at once?",
        answer:
          "You add recipes one at a time, and then print them together as a single job. The card size and the theme apply to every recipe waiting to print, so a week of dinners comes out matching.",
      },
      {
        question: "What happens if the post is taken down?",
        answer:
          "Nothing, once you have printed it. Accounts go private, posts get deleted, and creators clear out old work. A card in the box doesn't depend on any of that.",
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
    contentUpdated: "2026-09-09",
    primaryKeyword: "print recipe from Facebook",
    secondaryKeywords: [
      "print recipes from Facebook",
      "how to print recipes from Facebook Reels",
      "print Facebook recipe on iPhone",
      "can you print recipes from Facebook",
    ],
    shortLabel: "Facebook",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Free Facebook Recipe Printer",
    description:
      "Paste a Facebook post, group post, or Reel link and turn the recipe into a printable recipe card, page, or PDF.",
    h1: "Print recipes from Facebook",
    lede:
      "Facebook recipes are usually typed straight into a post, with no blog behind them. Paste the post's link and RecipePrinter turns it into something you can cook from.",
    howTo: [
      {
        name: "Copy the post's link",
        text: "On the post, tap the three dots and choose Copy link. Reels have the same option under Share.",
      },
      {
        name: "Paste it in",
        text: "Paste the link into the box above. RecipePrinter reads the recipe out of the post, whether it was typed in directly or sits on a site the post links to.",
      },
      {
        name: "Choose a card or a page",
        text: "A 4 by 6 card for a recipe box, or a letter page when the post runs to a wall of text. Every line can be edited before it prints.",
      },
      {
        name: "Print it or save it as a PDF",
        text: "Send it to the printer, or choose Save as PDF in the print dialog to keep a copy that doesn't live in the feed.",
      },
    ],
    featureSections: [
      {
        heading: "Group recipes are hard to find twice",
        image: "counter-card",
        body:
          "A good one goes past in a group at nine at night. A month later it's four hundred posts back, and you can't search for it because you never knew what it was called. Printing it takes it out of the feed: the card doesn't depend on the group, on the post staying up, or on remembering who shared it.",
      },
      {
        heading: "Most of them were typed, not linked",
        image: "steps",
        body:
          "Someone writes the whole thing into the post. A few lines about their mother, then the ingredients, then the method run together in one paragraph. There's no blog behind it and nothing to click through to. RecipePrinter takes the post as written and sorts it into an ingredient list with amounts and numbered steps you can follow at the stove.",
      },
      {
        heading: "The recipes worth keeping are often the oldest ones",
        image: "bound-cookbook",
        body:
          "Family groups hold recipes that were handwritten long before they were typed, posted by people who are not always still around to ask. Printing gives one of those somewhere to live that isn't a platform: a box on the counter, a binder, or later a bound cookbook that everyone in the group can have a copy of.",
      },
    ],
    faqs: [
      {
        question: "Can I print recipes from Facebook Reels?",
        answer:
          "Yes. Copy the Reel's link the same way you would a post. The recipe usually sits in the caption underneath, and that is what RecipePrinter reads.",
      },
      {
        question: "What about a recipe posted in a private group?",
        answer:
          "A post that only members can see won't always open for RecipePrinter the way a public one does. Copy the text of the post and paste that in instead, and you get the same card.",
      },
      {
        question: "Do I need to connect my Facebook account?",
        answer:
          "No. RecipePrinter doesn't ask for access to your account, your groups, or your saved posts. It works from a link or from text you paste across.",
      },
      {
        question: "Can I keep the recipe if the post is deleted?",
        answer:
          "Yes, and that is most of the reason to print it. Once the card is printed or saved as a PDF it doesn't depend on the post, the group, or the account that shared it.",
      },
      {
        question: "How do I print a Facebook recipe from my phone?",
        answer:
          "Copy the post's link in the app, then open RecipePrinter in your phone browser and paste it there. Set the card up and use the phone's own print dialog to reach a wireless printer, or choose Save as PDF and print it later.",
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
    contentUpdated: "2026-09-09",
    primaryKeyword: "print TikTok recipes",
    secondaryKeywords: [
      "print recipe from TikTok",
      "TikTok recipe printer",
      "save TikTok recipes",
      "print recipe from social media",
      "print recipe from video",
    ],
    shortLabel: "TikTok",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Free TikTok Recipe Printer",
    description:
      "Paste a TikTok link and turn the recipe in the caption into a printable recipe card, page, or PDF you can cook from.",
    h1: "Print TikTok recipes",
    lede:
      "A TikTok shows you the dish and moves on. Paste the video's link and RecipePrinter turns the recipe into a card that stays where you put it.",
    howTo: [
      {
        name: "Copy the video's link",
        text: "Tap Share on the video and choose Copy link. That's the link to the video itself, and it's the only one you need.",
      },
      {
        name: "Paste it in",
        text: "Paste the link into the box above. RecipePrinter reads the caption and the pinned comment, which is where creators write the ingredients and the method out.",
      },
      {
        name: "Choose a card or a page",
        text: "A 4 by 6 card for the box, or a letter page if the method runs long. Edit any line, including the amount you had to watch three times to catch.",
      },
      {
        name: "Print it or save it as a PDF",
        text: "Print it, or choose Save as PDF in the print dialog so the recipe is on your phone without the video around it.",
      },
    ],
    featureSections: [
      {
        heading: "A video is a demonstration. A card is a reference.",
        image: "counter-card",
        body:
          "Watching someone make it once is genuinely useful. Cooking along with it is a different job: scrubbing back fifteen seconds with a wet hand to check whether that was one teaspoon or two, while the video has already moved on to the plating. A printed card gives the amounts once and stays open at the right place for the whole hour you're in the kitchen.",
      },
      {
        heading: "The recipe is usually already written down",
        image: "steps",
        body:
          "Most creators put the ingredients and the steps in the caption or a pinned comment, because they know the video on its own is hard to cook from. That writing is what RecipePrinter reads when you paste the link, so what comes out is the creator's own recipe, set as a list of ingredients with amounts and numbered steps.",
      },
      {
        heading: "The ones you actually make again",
        image: "card-in-box",
        body:
          "Most saved videos are never made twice. The few that are earn a place off the app: printed, filed in a recipe box or a binder, and out of a feed built around the next video rather than the last one.",
      },
    ],
    faqs: [
      {
        question: "Can RecipePrinter print a recipe straight from a TikTok?",
        answer:
          "Yes. Paste the video's link and it reads the recipe from the caption and the pinned comment, which is where it's nearly always written.",
      },
      {
        question: "What if the amounts are only spoken in the video?",
        answer:
          "Some videos never write the recipe down anywhere. You can paste in what you catch and shape it from there. Every line on the card is editable, so a half-caught measurement is fixed once and stays fixed.",
      },
      {
        question: "What happens when the video disappears?",
        answer:
          "A printed card doesn't depend on it. Videos come down, accounts go private, and sounds get pulled, and none of that reaches a recipe already in the box.",
      },
      {
        question: "Can I save a TikTok recipe as a PDF?",
        answer:
          "Yes. Once the recipe is set up, choose Save as PDF in your browser's print dialog and keep it with the rest of your recipes.",
      },
      {
        question: "Do I need a TikTok account to use this?",
        answer:
          "No. RecipePrinter works from the link, so there's nothing to connect and nothing to sign into on our side.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-youtube-recipes", label: "Print YouTube recipes" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
    ],
  },
  {
    // No `lastReviewed` on purpose: this page has not had a read-through yet,
    // which is what that field records. It stays out of the reviewed set until
    // someone has actually gone over the copy.
    slug: "print-paprika-recipes",
    contentUpdated: "2026-09-09",

    primaryKeyword: "print Paprika recipes",
    secondaryKeywords: [
      "print recipe from Paprika",
      "Paprika recipe printer",
      "export Paprika recipes",
      "Paprika recipe cards",
      "print Paprika recipe manager",
      "Paprika recipes to PDF",
      "back up Paprika recipes",
    ],
    shortLabel: "Paprika",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "apps",
    importSubmitLabel: "Open a Paprika file",
    title: "Print Paprika Recipes",
    description:
      "Open a Paprika export file and turn the recipes you have collected into printable recipe cards, pages, and PDFs. The file is read in your browser.",
    h1: "Print recipes from Paprika",
    anchor: "Print Paprika recipes",
    lede:
      "Years of recipes live in Paprika, and every one of them is on a screen. Export the library, open the file here, and pick the ones that deserve to be on paper.",
    howTo: [
      {
        name: "Export from Paprika",
        text: "Open the Paprika app, click the menu at the top left, go to Settings, then Export Recipes and Export. You get a single .paprikarecipes file holding the whole library.",
      },
      {
        name: "Open the file here",
        text: "Drop the file into the box above. It's read in your browser and never uploaded, so the library doesn't leave your computer.",
      },
      {
        name: "Pick the ones worth printing",
        text: "The whole library arrives as a list you can go through. Add the recipes you actually cook to the print queue and leave the rest where they are.",
      },
      {
        name: "Choose a card or a page",
        text: "A 4 by 6 card for the recipe box, or a letter page for a binder. Print the batch in one job, or save it as a PDF.",
      },
    ],
    featureSections: [
      {
        heading: "The library comes across, not just the titles",
        image: "paste-in-app",
        body:
          "Ingredients, directions, the notes you added, prep and cook time, servings, the source it came from, and the categories you filed it under all carry over. A rating and a difficulty do not, because neither belongs on a printed card. What you have been keeping in Paprika arrives as a recipe, not as a row in a list.",
      },
      {
        heading: "It's read in your browser, not uploaded",
        image: "card-in-box",
        body:
          "The export file is opened and unpacked on your own machine. Nothing is sent to a server, no account is needed to do it, and the library isn't stored anywhere afterwards. Open the same file twice and the queue recognises what is already in it rather than stacking up a second copy of everything.",
      },
      {
        heading: "A collection that survives the app",
        image: "bound-cookbook",
        body:
          "A recipe manager is only as permanent as the company behind it and the phone in your hand. Printed cards in a box, pages in a binder, or a bound cookbook on a shelf keep working when the subscription lapses, the export format changes, or the app is gone.",
      },
    ],
    faqs: [
      {
        question: "What file does Paprika export?",
        answer:
          "A single .paprikarecipes file containing the whole library, one entry per recipe with its photo embedded. Open the Paprika app, click the menu at the top left, go to Settings, then Export Recipes and Export.",
      },
      {
        question: "Does my Paprika library get uploaded?",
        answer:
          "No. The file is opened and read in your browser, on your own machine. Nothing is sent to a server and no account is required to do it.",
      },
      {
        question: "Can I print my whole Paprika library at once?",
        answer:
          "You can, though most people don't want to. The export arrives as a list to choose from, so you can add just the recipes you actually cook to the print queue and print those in one job.",
      },
      {
        question: "Do the notes and categories I added come across?",
        answer:
          "Yes. Notes, prep and cook time, servings, the original source, and the categories you filed a recipe under all carry over. Ratings and difficulty do not, since neither reads as part of a printed recipe.",
      },
    ],
    links: [
      { href: "/organize-recipes", label: "Organize recipes" },
      { href: "/recipe-binder", label: "Make a recipe binder" },
      { href: "/family-recipe-book", label: "Build a family cookbook" },
    ],
  },
  {
    slug: "print-youtube-recipes",
    contentUpdated: "2026-09-09",
    primaryKeyword: "print recipe from YouTube",
    secondaryKeywords: [
      "how to print recipe from YouTube",
      "can you print recipes from YouTube",
      "print recipe from YouTube video",
      "save YouTube recipe as PDF",
    ],
    shortLabel: "YouTube",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Free YouTube Recipe Printer",
    description:
      "Paste a YouTube link and turn the recipe written in the description into a printable recipe card, page, or searchable PDF.",
    h1: "Print a recipe from YouTube",
    lede:
      "The recipe in a cooking video is usually written out in the description. Paste the video's link and RecipePrinter lifts it onto a card or a page.",
    howTo: [
      {
        name: "Copy the video's link",
        text: "Use Share, then Copy link, or take the address straight out of your browser. Both point at the same video.",
      },
      {
        name: "Paste it in",
        text: "Paste the link into the box above. RecipePrinter reads the description, where the ingredients and the method are usually written out in full.",
      },
      {
        name: "Choose a card or a page",
        text: "A letter page suits a long bake with a dozen steps, and a 4 by 6 card suits a weeknight. Edit any line, and decide whether the photo prints.",
      },
      {
        name: "Print it or save it as a PDF",
        text: "Print it, or choose Save as PDF in the print dialog to keep it with your other recipes.",
      },
    ],
    featureSections: [
      {
        heading: "The description holds the recipe, and everything else",
        image: "steps",
        body:
          "Under the video there's the recipe, and around it the discount code, the equipment links, the chapter timestamps, the other channels, and a paragraph about the newsletter. RecipePrinter keeps the ingredients with their amounts, the numbered steps, the times, and the servings, and leaves the rest where it is.",
      },
      {
        heading: "Twenty minutes of video, one sheet of paper",
        image: "counter-card",
        body:
          "A cooking video is paced for watching. Ingredients arrive as they are used, the oven temperature is said once around minute four, and finding it again means dragging a timeline with flour on your hands. On paper the whole thing is in front of you at once, in the order you need it.",
      },
      {
        heading: "A PDF you can search",
        image: "pdf-search",
        body:
          "Save the recipe as a PDF and it behaves like a document rather than a video. Search it for sesame oil and it tells you which page. Keep a folder of them and the phone in your kitchen becomes something you look things up in, instead of a watch history you scroll.",
      },
    ],
    faqs: [
      {
        question: "Can RecipePrinter get the recipe from any cooking video?",
        answer:
          "It works from the recipe the channel wrote down, which usually means the description and sometimes a pinned comment. When a video has no written recipe anywhere, there's nothing to read from, and you can paste your own notes in instead.",
      },
      {
        question: "Can I print a recipe from a YouTube Short?",
        answer:
          "Yes, the same way. Shorts have descriptions and pinned comments too. They tend to be briefer, so there's more often a line to fill in by hand before you print.",
      },
      {
        question: "Can I save a YouTube recipe as a PDF?",
        answer:
          "Yes. Choose Save as PDF in your browser's print dialog once the recipe is set up, and it saves as a normal file you can keep or send on.",
      },
      {
        question: "The description links to the channel's own site. Which should I paste?",
        answer:
          "Either works, and they give you slightly different things. The video's link gets you the recipe as the description states it. The site's link usually gets you a fuller version, with the notes and substitutions the channel had room for there.",
      },
      {
        question: "Will the card link back to the video?",
        answer:
          "It can, and that's your call. The video's link can print on the card, so the channel is credited and the demonstration is one tap away when you want to see a technique again.",
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
    contentUpdated: "2026-09-09",
    captureHeading: "Start with one recipe",
    primaryKeyword: "organize recipes",
    secondaryKeywords: [
      "recipe organization ideas",
      "organize recipes from Pinterest",
      "recipe collection ideas",
      "how to save recipes",
    ],
    cookbookPitch: true,
    shortLabel: "An organized collection",
    pickerGroup: "output",
    intent: "Organization SEO",
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
      { href: "/print-paprika-recipes", label: "Print Paprika recipes" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/printable-recipe-card-generator", label: "Printable recipe cards" },
    ],
  },
  {
    slug: "recipe-binder",
    contentUpdated: "2026-09-09",
    captureHeading: "Start your binder",
    primaryKeyword: "recipe binder",
    secondaryKeywords: [
      "recipe binder ideas",
      "recipe binder printables",
      "recipe notebook ideas",
      "recipe organization ideas",
    ],
    cookbookPitch: true,
    shortLabel: "A binder",
    pickerGroup: "output",
    intent: "Organization SEO",
    statusNote:
      "Coming soon: dedicated binder-building features. For now, RecipePrinter helps you create the printable pages, cards, and PDFs that can go into a binder.",
    title: "Recipe Binder Ideas for Online Recipes",
    description:
      "Build a recipe binder from online recipes, printable recipe cards, PDFs, screenshots, and family favorites.",
    h1: "Recipe binder ideas for recipes you find online",
    anchor: "Recipe binder ideas",
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
      { href: "/print-paprika-recipes", label: "Print Paprika recipes" },
      { href: "/printable-recipe-card-generator", label: "Printable recipe cards" },
      { href: "/family-recipe-book", label: "Family recipe book ideas" },
    ],
  },
  {
    slug: "preserve-family-recipes",
    contentUpdated: "2026-09-09",
    // Signed off on the writing. One image is still owed: "Keep the original,
    // cook from the copy" wants a photograph of the printed copy lying beside
    // the handwritten card it came from, which is the whole claim in one frame
    // and does not exist yet. It borrows `counter-card` until then, because the
    // hero already carries `handwritten-card` and a page should not show the
    // same photograph twice. Shoot that pair, register it in LandingVisuals,
    // and swap the key below.
    lastReviewed: "2026-09-03",
    captureHeading: "Start with one card",
    primaryKeyword: "preserve family recipes",
    secondaryKeywords: [
      "handwritten recipe preservation",
      "recipe keepsake",
      "family recipe book ideas",
      "recipe memory book",
    ],
    shortLabel: "Preserved family recipes",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    // Preservation by intent, but the thing someone wants here is to photograph
    // the card in their hand, so capture stays in the hero.
    layout: "capture-first",
    heroImage: "handwritten-card",
    initialImportMode: "image",
    importSubmitLabel: "Make a printable copy",
    title: "Preserve Family Recipes",
    description:
      "Preserve family recipes by turning old cards, photos, screenshots, and text into printable keepsakes and a bound family cookbook.",
    h1: "Preserve family recipes",
    lede:
      "Photograph the card and RecipePrinter turns the handwriting into a clean printable recipe. One copy in a drawer becomes one for the kitchen, and one for everyone who asks for it.",
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
        text: "A 4 by 6 card for the box or a letter page for the binder. The copy goes in the kitchen, and the original stays where it is.",
      },
      {
        name: "Gather them when you're ready",
        text: "Once there are enough, they can become a bound cookbook with a cover, chapters and a table of contents.",
      },
    ],
    featureSections: [
      {
        heading: "Keep the original, cook from the copy",
        image: "counter-card",
        body:
          "A printed copy does the kitchen work: the counter, the splashes, the folding into a binder, the stuck-to-the-fridge afternoons. The handwritten card stays wherever you keep it, exactly as it is. You're still cooking their recipe every time you use the copy.",
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
          "Usually. Faded pencil and cursive are the hard ones, and it won't always catch every word. Whatever it does read arrives as an editable recipe, so you're tidying a line here and there rather than typing the card out from scratch.",
      },
      {
        question: "What if the card is too faded to read?",
        answer:
          "You can type it in, and nothing changes from there. The recipe gets the same clean page, the same card or letter layout, and the same place in a book later.",
      },
      {
        question: "Can I keep who it came from?",
        answer:
          "Yes. A recipe carries a note of its own, and that is where the name goes, or the year, or the thing they always said about it.",
      },
      {
        question: "Do these have to become a cookbook?",
        answer:
          "No. Printing one card and stopping there is enough. The bound cookbook with a cover and chapters is there if you ever want it, at $19.99 a cookbook.",
      },
    ],
    links: [
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/reciscan-alternative", label: "ReciScan alternative" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/printable-recipe-card-generator", label: "Make recipe cards" },
    ],
  },
  {
    slug: "family-recipe-book",
    contentUpdated: "2026-09-09",
    // Signed off on the writing. The three feature rows still ask for `photo`
    // and `book` proof kinds that have no image behind them, so they render as
    // text-only blocks: there is no finished family cookbook to photograph yet.
    // Register those two kinds in LandingVisuals when there is, and this page
    // picks them up with no edit here.
    lastReviewed: "2026-09-02",
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
    shortLabel: "A family cookbook",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    title: "Family Recipe Book Ideas",
    description:
      "Create a family recipe book from printed recipes, old cards, online favorites, photos, and kitchen notes.",
    h1: "Family recipe book ideas",
    lede:
      "RecipePrinter turns online recipes, old cards, photos, and typed-in notes into clean, matching pages, then binds them into a cookbook with a cover, chapters, and a table of contents.",
    importSubmitLabel: "Start the cookbook",
    captureReassurance: false,
    howTo: [
      {
        name: "Gather the recipes",
        text: "Bring together the recipes you want to keep: paste links, photograph old handwritten cards, upload screenshots, or type in the ones that only live in someone's head.",
      },
      {
        name: "Clean up each page",
        text: "RecipePrinter sets every recipe on a clear, consistent page, so a faded card and a link from a group chat end up looking like they belong in the same cookbook.",
      },
      {
        name: "Add chapters and a cover",
        text: "Chapters if you want them, breakfasts and mains or grouped by who they came from. A cover and a dedication go on the front.",
      },
      {
        name: "Print at home or send to a printer",
        text: "Print the finished cookbook at home, or export it and have a print shop bind a copy. Either one makes a gift.",
      },
    ],
    featureSections: [
      {
        heading: "Different sources, one consistent cookbook",
        proof: "photo",
        body:
          "Family recipes arrive in every format: a stained index card, a screenshot from a group chat, a link a cousin sent, a method that only lives in someone's head. RecipePrinter reads each one and sets it on a clean, consistent page, so a card from 1975 and a text from last week look like they belong in the same book.",
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
        question: "How many recipes make a cookbook?",
        answer:
          "As few or as many as you like. Eight recipes with a cover on them makes a real gift, and so does forty. The contents page renumbers itself as you add, so you can keep going for as long as you want to.",
      },
      {
        question: "Can other people in the family add theirs?",
        answer:
          "Not directly, there's no invite link. They can send you the recipe however they have it though, a photo of a card, a screenshot, a text message, and you add it to the book from there.",
      },
      {
        question: "How do I actually get it printed and bound?",
        answer:
          "Two ways. Print it at home on the Letter layout, set up for a spiral or 3-ring binder, or export the file and hand it to a print shop, where the 8 by 10 hardcover layout gives them what a case-bound book needs.",
        links: Object.values(PRINTERS).map((printer) => ({
          href: printer.url,
          label: printer.name,
          note: printer.note,
        })),
      },
      {
        question: "What does a cookbook cost?",
        answer:
          "$19.99 for that cookbook, and it stays yours to edit and add to afterwards. After that it's whatever the printing costs: paper and ink at home, or whatever the print shop charges.",
      },
    ],
    links: [
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/organize-recipes", label: "Organize recipes" },
    ],
  },
  {
    slug: "just-the-recipe-alternative",
    contentUpdated: "2026-09-09",
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
    shortLabel: "Just the Recipe",
    pickerGroup: "comparison",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Just the Recipe Alternative for Printing",
    description:
      "Comparing RecipePrinter and Just the Recipe: both clean up a recipe page, and they differ on printing, what you can bring in, and what the free tier does.",
    h1: "A Just the Recipe alternative built for printing",
    anchor: "Just the Recipe alternative",
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
          "Choose a 4 by 6 card sized for a recipe box or a full letter page, pick a theme, turn on cut lines for card stock, and print several recipes in one job. Printing is free and works without an account, so you can try it on the recipe you were about to print anyway.",
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
            { feature: "Bound cookbook with a cover and chapters", us: "$19.99 a cookbook, edits included", them: false },
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
          "By where the recipe ends up. If you cook from a screen, that's what Just the Recipe does. If it ends up on paper, in a card box or a binder, that is what RecipePrinter does.",
      },
      {
        question: "What does each one cost?",
        answer:
          "Just the Recipe is free to read recipes and to save up to 20; printing, unlimited saves and serving adjustments are on Premium. RecipePrinter is free to print, with no account and no limit, and sells premium themes and cookbooks one at a time, never on subscription.",
      },
      {
        question: "Can I bring my saved Just the Recipe recipes over?",
        answer:
          "Not directly. There's no export from Just the Recipe that RecipePrinter can read, so the quickest route is pasting the original links in again. Paprika export files and CookPilot libraries do come straight across.",
      },
      {
        question: "Does RecipePrinter have an app?",
        answer:
          "No. It runs in any browser, on a phone or a computer, so there's nothing to install and nothing to sign into before you print.",
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
    contentUpdated: "2026-09-09",
    lastReviewed: "2026-09-02",
    primaryKeyword: "ReciScan alternative",
    secondaryKeywords: [
      "recipe scanner alternative",
      "recipe card maker",
      "preserve family recipes",
      "family recipe book ideas",
    ],
    shortLabel: "ReciScan",
    pickerGroup: "comparison",
    intent: "Preservation and Gift SEO",
    // Preservation by intent, but someone searching a competitor's name wants
    // to try the thing now, so capture stays in the hero like the other
    // alternative page rather than waiting below an explanation.
    layout: "capture-first",
    title: "ReciScan Alternative",
    description:
      "Comparing RecipePrinter and ReciScan: both read old recipe cards, and they differ on what comes out, what it costs, and how long it takes.",
    h1: "A ReciScan alternative that prints today",
    anchor: "ReciScan alternative",
    lede:
      "Both read links, photos and pasted text. ReciScan turns them into a bound cookbook and ships it to you. RecipePrinter gives you the pages: print them now, keep the PDF, or take the file to a print shop.",
    featureSections: [
      {
        heading: "A card, a page, or the whole cookbook",
        proof: "card",
        body:
          "ReciScan ends in a bound book from its own press, starting at $18 for fifty pages. RecipePrinter hands you the file: a 4 by 6 card for the box by the stove, a letter page for a binder, or a bound cookbook with a cover and chapters. Printing one card tonight doesn't rule out the cookbook.",
      },
      {
        heading: "Nothing to install",
        image: "mobile-vs-desktop",
        body:
          "ReciScan is an app you download to a phone. RecipePrinter is a web page, so a link, a photo or a block of pasted text becomes a printable recipe in the same browser you're reading this in, without an install or an account.",
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
            { feature: "A 4 by 6 card for a recipe box, with cut lines", us: true, them: false },
            { feature: "A full letter page for a binder", us: true, them: false },
            { feature: "Printing it yourself", us: "Free, no account", them: true },
          ],
        },
        {
          title: "Making a cookbook",
          rows: [
            { feature: "A cookbook you print or export yourself", us: "$19.99 a cookbook", them: "PDF download" },
            { feature: "Spiral or hardcover layout", us: "Letter spiral, 8 by 10 hardcover", them: "Coil, saddle stitch, perfect bound, hardcover" },
            { feature: "Updating the cookbook you paid for", us: "Free, any time", them: false },
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
          "By what you want at the end. If it's one bound cookbook of the whole collection, ReciScan prints and ships that. If it's recipes on paper you can cook from this week, in a box or a binder, that's RecipePrinter.",
      },
      {
        question: "What does each one cost?",
        answer:
          "ReciScan is free to use, with a $4.99 monthly subscription for covers and extras, and printed books starting at $18. RecipePrinter is free to print. Premium themes are $1.99 and yours for life, and a cookbook is $19.99 for each one you build. Neither renews.",
      },
      {
        question: "Can RecipePrinter send me a printed cookbook?",
        answer:
          "Not directly. It builds the finished cookbook as a print-ready file: run it on a home printer, keep the PDF, or take it to a print shop to have bound. A copy shop works from the same file if you would rather not print it yourself.",
      },
      {
        question: "What if I only want a few recipes, not a whole cookbook?",
        answer:
          "You can. There's no minimum and nothing to finish: print one card, print three, come back in a month. The cookbook is there when you want it, and not before.",
      },
    ],
    links: [
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/family-recipe-book", label: "Family recipe book ideas" },
    ],
  },
];

export const SEO_LANDING_PAGE_MAP = new Map(
  SEO_LANDING_PAGES.map((page) => [page.slug, page]),
);

/**
 * The words another page should use when linking here. Never render `title` as
 * link text: a title is written to win a click in a search result ("Free …"),
 * an anchor is written to tell Google and the reader what sits on the other
 * end of the link. See `SeoLandingPage.anchor`.
 */
export function anchorFor(page: SeoLandingPage): string {
  return page.anchor ?? page.h1;
}

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
