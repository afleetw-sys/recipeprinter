import type { Metadata } from "next";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import type { ImportTab } from "@/types/recipe";
import { PRINTERS } from "@/lib/cookbookPresets";
import { PRO_ANNUAL_PRICE_FALLBACK, PRO_MONTHLY_PRICE_FALLBACK } from "@/lib/proProduct";
import { IMAGE_IMPORTS_PER_HOUR_FREE, IMAGE_IMPORTS_PER_HOUR_PRO } from "@/lib/imageImportQuota";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";

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
  copyReviewed?: string;
  /**
   * The date this page's images were checked against the claims they sit
   * beside (YYYY-MM-DD). Leave unset until every image on the page has had a
   * deliberate relevance, crop, and alt-text review.
   */
  imagesReviewed?: string;
  /**
   * The day this page's rendered content last changed (YYYY-MM-DD), and what
   * <lastmod> is built from.
   *
   * Separate from `copyReviewed` because the two are different facts and were
   * drifting apart the moment anything was edited: `copyReviewed` means a human
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
  /**
   * What the capture field is called on this page, overriding the generic name
   * of whichever input it shows ("Recipe link", "Recipe text", "Recipe photos").
   *
   * Worth setting wherever the page is about ONE source. A page that opens on
   * "Print TikTok recipes" and then labels its only box "Recipe link" makes the
   * visitor do the matching themselves, and the ones who do it wrong decide a
   * TikTok URL is not what this box wants and leave. "TikTok link" is the same
   * field saying yes.
   */
  importFieldLabel?: string;
  /** Placeholder text inside the capture field, for the same reason as
      `importFieldLabel`. Defaults to the generic per-mode copy. */
  importPlaceholder?: string;
  /** Resting title inside a single-image upload dropzone. */
  importUploadTitle?: string;
  /** Which sources this page offers. Defaults to just `initialImportMode` —
      the deliberately minimal single field every page keeps by design (see
      the file-level comment on SeoCapture). Name two or more only where the
      page's own subject IS the choice between sources, not one of them —
      it swaps the field for the shared ImportPanel switch, restricted to
      the sources listed. */
  importModes?: ImportTab[];
  /** A FEATURE_IMAGES key for the hero photo, when the page's subject is not
      one of the printed cards. Without it every utility page opens on the same
      card. */
  heroImage?: string;
  /** Page-specific alt text for a named hero image. */
  heroImageAlt?: string;
  heroCardKey?: string;
  /** The little label on the hero photo. Only read when `heroImage` is set —
      the built-in captions describe the printed cards, and a page showing
      something else should not inherit one. Omit for no label. */
  heroAnnotation?: string;
  /** `document` swaps the light photo-frame for a dark, padded canvas with
      a shadow — for a `heroImage` that IS a document (a saved PDF) rather
      than a photographed card, so it reads as something being viewed
      instead of a flat rectangle. `none` drops the frame entirely — for a
      `heroImage` that already carries its own (a window screenshot,
      say), where a second frame around it would be redundant. Defaults
      to the usual `card` frame. */
  heroFrame?: "card" | "document" | "none";
  /** Heading over the guide-first capture block. Hardcoded to "Start your
      family cookbook" until four guide pages that are not about cookbooks
      inherited it. */
  captureHeading?: string;
  /** Reassurance below capture. Off by default — set it only where there's
      something worth clarifying: a recipe-card page's Pro-gated 4x6
      printing, a Pro-only capability the page argues for. Most utility
      pages have no pricing wrinkle to explain and just went quiet. */
  captureReassurance?: string;
  /** Short hint shown under the capture block when the preselected mode needs a caveat. */
  importHint?: string;
  title: string;
  description: string;
  h1: string;
  /** Shorter label for the breadcrumb when the page heading is descriptive. */
  breadcrumbLabel?: string;
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
  /**
   * The narrower pages this one sits above, shown as a picker straight after
   * the hero. For a hub like /print-social-media-recipes, whose visitor often
   * already knows which app the recipe is in and wants that page's specifics.
   */
  hub?: { label: string; slugs: string[] };
  lede: string;
  /** One-sentence subtitle under the how-to section's heading. Renders only
      alongside `howTo` — nothing on its own if that's unset. */
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
  /** Overrides the shared section's heading ("When the stack becomes a
      book"), for a page whose own subject wants a different frame on the
      same pitch (a PDF page becoming "When one recipe becomes a
      collection", say). */
  cookbookPitchHeading?: string;
  /** Overrides the shared section's body paragraph, for a page that wants
      the cookbook mentioned more lightly than the default pitch argues it —
      own recipe-card or one-off intent shouldn't read as a cookbook page.
      The feature image and the link to family-recipe-book stay the shared
      ones. */
  cookbookPitchBody?: string;
  /** A phrase in `cookbookPitchBody` to link, in place of the shared
      trailing link to /family-recipe-book. */
  cookbookPitchLink?: { phrase: string; href: string };
  /** "How to …" steps, renders the section and the HowTo JSON-LD. */
  howTo?: { name: string; text: string }[];
  /** Heading over the how-to section. Defaults to "How it works". */
  howToHeading?: string;
  /** 2–3 deep-dive sections, each targeting a secondary keyword, with a proof
      visual. `caption` labels that row's visual; omit it when the image already
      labels itself, rather than captioning it with something generic. */
  featureSections?: {
    heading: string;
    body: string;
    /** Paragraphs after `body`, each styled the same. A list for the rare row
        whose claim needs more than two short paragraphs to state plainly. */
    afterBody?: string | string[];
    proof?: SeoProofKind;
    caption?: string;
    /** Names a specific visual, overriding the one `proof` would pick. Use when
        two rows would otherwise land on the same image. */
    image?: string;
    /** Page-specific alt text when the shared image is evidence for a more
        specific claim on this page. */
    imageAlt?: string;
    /** Phrases in `body` or `afterBody` to link, first occurrence of each.
        One or two at most: a paragraph of links reads as navigation. */
    links?: { phrase: string; href: string }[];
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
        `copyReviewed` records a content pass, so a stale table is greppable
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
  /** Subtitle under the examples gallery's heading. Defaults to "Actual
      recipe cards printed with RecipePrinter, no mockups." */
  examplesSubtitle?: string;
  /**
   * Heading over the FAQ section. Required, and named for the page's topic in
   * one of two shapes: "[Topic] questions" ("Recipe binder questions") or
   * "Questions about [topic]" ("Questions about organizing recipes"). There
   * used to be a generic "Questions people ask" fallback, and ten pages
   * quietly took it.
   */
  faqHeading: string;
  /** `links` hangs outbound chips under an answer, for the questions whose
      real answer is somewhere else. The JSON-LD keeps `answer` alone: the
      structured data is the answer, not the chrome around it. */
  faqs: {
    question: string;
    answer: string;
    answerEmphasis?: string;
    links?: { href: string; label: string; note?: string }[];
  }[];
  links: { href: string; label: string }[];
};

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "print-recipe-from-website",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-02",
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
    // The page's whole promise in one picture: the 26-page browser printout
    // beside the one card. Row 1 then shows that card up close.
    heroImage: "before-after",
    // Composed with its own dark canvas and captions; the 4:3 card crop cut
    // the "26 pages" caption off its left edge.
    heroFrame: "none",
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
        text: "On the food blog, copy the page's link from your browser, or tap Share and choose Copy link.",
      },
      {
        name: "Paste it in",
        text: "Paste the link above. RecipePrinter reads the page and rebuilds the recipe as a clean, printable layout.",
      },
      {
        name: "Choose how it prints",
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
        image: "caprese-card",
        body:
          "Print this caprese pasta salad straight from the food blog and it takes 26 sheets of paper. RecipePrinter reads the same page and keeps only what you cook from: the ingredients with amounts, the numbered steps, the prep and cook times, and the servings.",
        afterBody: [
          "The blogger's story, the autoplay video, the comments, and the ads stay behind.",
          "The original link prints on the card too, so the page is easy to find again.",
        ],
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
          "Some recipes hide behind a login, sit on a site that blocks importers, or live only in a video's description. When a link won't import cleanly, paste the recipe text or upload a screenshot, and RecipePrinter structures it into the same clean printout.",
      },
    ],
    faqHeading: "Questions about printing from a website",
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
          "Yes, with RecipePrinter Pro. Add as many recipes as you want and print them all in one job, instead of printing each recipe separately. That's handy when you're printing a week of dinners. A single recipe prints free, no account needed.",
        links: [{ href: "/print-meal-plan-recipes", label: "Print a week of dinners" }],
      },
      {
        question: "What happens if the original page disappears?",
        answer:
          "Your printed copy stays as it is. Recipe pages sometimes move behind a paywall, get rewritten, or go offline, but the card in your kitchen doesn't change. Save it as a PDF too if you'd like a digital copy.",
      },
    ],
    links: [
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
      { href: "/print-recipe-without-ads", label: "Print recipes without ads" },
      { href: "/just-the-recipe-alternative", label: "Just the Recipe alternative" },
      { href: "/convert-recipe-to-pdf", label: "Convert a recipe to PDF" },
    ],
  },
  {
    slug: "print-recipe-without-ads",
    contentUpdated: "2026-10-05",
    imagesReviewed: "2026-10-05",
    copyReviewed: "2026-09-02",
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
    // The 26-page browser printout beside the one card: what "without ads"
    // means, in one picture. Uncropped so its captions survive.
    heroImage: "before-after",
    heroFrame: "none",
    initialImportMode: "url",
    title: "Print Recipes Without Ads",
    description:
      "Turn cluttered recipe pages into clean printable recipes without ads, pop-ups, comments, or wasted pages. Free, and no account needed to print.",
    h1: "Print a recipe without ads",
    lede:
      "Paste a recipe link and RecipePrinter prints just the recipe: no ads, no pop-ups, no comments. One clean page you can cook from.",
    howTo: [
      {
        name: "Copy the recipe link",
        text: "On the food blog, copy the page's link from your browser, or tap Share and choose Copy link.",
      },
      {
        name: "Paste it above",
        text: "RecipePrinter pulls out the ingredients and steps, and leaves the ads, pop-ups, and comments behind.",
      },
      {
        name: "Make any changes",
        text: "Fix an amount or reword a step right on the page. Choose a full page or a 4×6 card (with Pro), pick a theme, and keep or drop the photo.",
      },
      {
        name: "Print it or save a PDF",
        text: "Send it to your printer, or choose Save as PDF to keep a clean copy.",
      },
    ],
    featureSections: [
      {
        heading: "One sheet instead of twenty-six",
        image: "souvlaki",
        imageAlt:
          "One printed page holding the whole Chicken Tzatziki Bowls recipe, beside the finished bowl.",
        body:
          "Your browser's print button prints the whole page as it is, including the story, the ad spaces, and the comments. RecipePrinter takes just the recipe from the page and sets it out on its own: the ingredients, the steps, and the times.",
      },
      {
        heading: "With or without the photo",
        image: "show-photo",
        body:
          "Keep the finished-dish photo, or turn it off with one switch to save color ink and give the recipe more room.",
        afterBody: "The ingredients, the steps, and the times stay exactly as they were.",
      },
    ],
    faqHeading: "Questions about printing without ads",
    faqs: [
      {
        question: "Is this an ad blocker?",
        answer:
          "No. An ad blocker hides ads on the page you're looking at. RecipePrinter makes a new page with just the recipe, so there are no ads to hide.",
      },
      {
        question: "Can I see it before I print?",
        answer:
          "Yes. The preview shows exactly what will print, so you can check the recipe and make changes before anything reaches your printer.",
      },
      {
        question: "What about pop-ups and cookie banners?",
        answer:
          "They never reach the printer. Those overlays are drawn by your browser as the page loads, and RecipePrinter reads the recipe straight from the page's own data instead, so the box you would have had to close is never in the way.",
      },
      {
        question: "How much paper does one recipe take?",
        answer:
          "Usually one sheet. A long recipe can run onto the back of the card or a second page, but not the 26 pages the browser printed.",
      },
      {
        question: "What if a recipe won't import?",
        answer:
          "Some recipes sit behind a login or on a site that blocks importers. Copy the recipe text and paste it in, or upload a screenshot, and you get the same clean printout.",
        links: [{ href: "/print-recipe-from-screenshot", label: "Print a recipe from a screenshot" }],
      },
      {
        question: "Is it free?",
        answer: `Yes. Importing and printing full-page recipes is free, with no account. RecipePrinter Pro (${PRO_MONTHLY_PRICE_FALLBACK} or ${PRO_ANNUAL_PRICE_FALLBACK}) adds 4×6 recipe cards, premium themes, and printing several recipes at once.`,
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/just-the-recipe-alternative", label: "Just the Recipe alternative" },
      { href: "/convert-recipe-to-pdf", label: "Save recipe as PDF" },
      { href: "/screen-free-cooking", label: "Cook without your phone" },
    ],
  },
  {
    slug: "convert-recipe-to-pdf",
    contentUpdated: "2026-10-05",
    imagesReviewed: "2026-10-05",
    copyReviewed: "2026-09-02",
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
    importModes: ["url", "apps", "image", "text"],
    // Overrides the default printed-card hero photo — this page's subject is
    // the PDF itself, and showing one of the same recipe-card photos every
    // other utility page opens on would answer a different question than
    // the one someone searching "convert recipe to PDF" asked. No
    // `heroAnnotation` on purpose: the default "Printed from a recipe link"
    // caption describes a printed CARD, and would be wrong here.
    heroImage: "convert-to-pdf",
    heroFrame: "none",
    title: "Convert a Recipe to PDF | RecipePrinter",
    description:
      "Turn an online recipe, screenshot, photo, or pasted text into a clean recipe PDF you can save, print, or keep for later.",
    h1: "Convert a recipe to PDF",
    lede:
      "Turn a recipe from a website, photo, screenshot, or pasted text into a clean PDF you can save, share, or print.",
    howTo: [
      {
        name: "Add the recipe",
        text: "Paste a recipe link, upload a photo or screenshot, or paste the text. RecipePrinter pulls out the ingredients and steps.",
      },
      {
        name: "Choose the page format",
        text: "Use a full letter page for a traditional recipe PDF, or preview the 4 by 6 card format with RecipePrinter Pro.",
      },
      {
        name: "Save as PDF",
        text: "Click Print, then choose Save as PDF where you'd normally pick your printer. No plugin or download needed.",
      },
      {
        name: "Keep, share, or print it",
        text: "Save the PDF on your phone or computer, send it to someone, or print it whenever you need it.",
      },
    ],
    featureSections: [
      {
        heading: "Save the recipe, not the whole webpage",
        proof: "before-after",
        body:
          "Saving a recipe directly from a website can turn the entire article, ads and all, into a long PDF. RecipePrinter pulls out the recipe first, so the PDF contains the ingredients and instructions you actually wanted to keep.",
      },
      {
        heading: "A recipe you can search",
        image: "pdf-search",
        body:
          "A screenshot is just a picture. A RecipePrinter PDF contains real text, so you can search for an ingredient, copy an amount, zoom in without losing clarity, and print it cleanly later.",
      },
    ],
    cookbookPitchHeading: "When one recipe becomes a collection",
    cookbookPitchBody:
      "If you want to combine many recipes into something more permanent, you can also put them in a cookbook: sort them into chapters and choose a cover, and RecipePrinter builds the table of contents. Cookbook exports are purchased separately.",
    faqHeading: "Recipe PDF questions",
    faqs: [
      {
        question: "Where is the PDF download button?",
        answer:
          "There isn't a separate one. Click Print, choose Save as PDF where you'd normally pick your printer, and save the file wherever you keep downloads.",
      },
      {
        question: "Can I save several recipes in one PDF?",
        answer:
          "Yes, with RecipePrinter Pro. Add multiple recipes to the print queue and save them together as one PDF. A single full-page recipe can be saved as a PDF for free.",
      },
      {
        question: "Can I make a PDF from a photo or screenshot?",
        answer:
          "Yes. Upload a screenshot, cookbook page, handwritten recipe, or photo of an old recipe card. RecipePrinter reads the recipe from the image and turns it into editable text before you save it as a PDF.",
      },
      {
        question: "Can I use the recipe PDF offline?",
        answer:
          "Yes. Once you save the PDF, it lives on your device like any other file and can be opened without an internet connection.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/recipe-card-printer", label: "Make recipe cards" },
    ],
  },
  {
    slug: "recipe-card-printer",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-09",
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
    // A 4×6 card on its own, already 4:3, so the hero shows it uncropped.
    heroImage: "caprese-card-board",
    initialImportMode: "url",
    importSubmitLabel: "Make recipe card",
    importModes: ["url", "apps", "image", "text"],
    title: "Recipe Card Printer | Make & Print 4×6 Recipe Cards",
    description:
      "Turn recipes from websites, photos, screenshots, and text into printable 4×6 recipe cards. Preview your card online, choose a design, and print it at home.",
    h1: "Recipe Card Printer",
    anchor: "Recipe card printer",
    lede:
      "Turn recipes from websites, photos, screenshots, or text into clean 4×6 recipe cards ready to print and keep.",
    cookbookPitchBody:
      "When your recipe card collection grows into something bigger, RecipePrinter can turn it into a cookbook. Organize recipes into chapters, create a cover and table of contents, rearrange pages, then print at home or export the file for professional printing.",
    examplesSubtitle: "Real 4×6 recipe cards printed with RecipePrinter. No mockups.",
    faqHeading: "Recipe card printing questions",
    howToHeading: "How to print recipe cards",
    howTo: [
      {
        name: "Add your recipe",
        text: "Paste a recipe link, upload a photo, or paste the text. RecipePrinter pulls the ingredients and steps into a clean format.",
      },
      {
        name: "Choose 4×6 recipe cards",
        text: "Switch from a full page to the 4×6 card size. Preview the finished card for free, and print it with RecipePrinter Pro.",
      },
      {
        name: "Pick a design",
        text: "Choose a theme for the type, borders, and photo layout. Pro includes every premium theme.",
      },
      {
        name: "Print and keep it",
        text: "Print directly on 4×6 card stock or use cut lines to trim a letter-size sheet, then add the finished card to your recipe box.",
      },
    ],
    featureSections: [
      {
        heading: "Sized for the box it's going in",
        image: "card-in-box",
        body:
          "A 4 by 6 card is the size a standard recipe box takes, so what comes off your printer drops straight into the box or an index-card binder. Cut lines give you a trim guide when you print on card stock, and the type stays large enough to read from across the counter. Card printing comes with RecipePrinter Pro ($4.99 a month or $39.99 a year); importing and full-page printing stay free.",
      },
      {
        heading: "Change the look, keep the recipe",
        image: "multi-themes",
        body:
          "A theme changes a card's type, its border, and how the photo sits, without touching the recipe underneath. Switch themes and every card in the batch follows, so a stack printed in one go still looks like a set. Two themes are free; the rest come with Pro.",
      },
    ],
    // Three 4×6 cards in three different themes, all real prints.
    examples: ["hot-honey", "quilt-noodles", "pb-blossoms"],
    faqs: [
      {
        question: "Can I turn an online recipe into a recipe card?",
        answer:
          "Yes. Paste the recipe link and RecipePrinter pulls out the ingredients and instructions, removes the surrounding page clutter, and formats it as a printable recipe card.",
      },
      {
        question: "What should I print recipe cards on?",
        answer:
          "Card stock works best, since it holds up well in the kitchen. If your printer takes 4×6 cards, you can print on them directly. Otherwise, print on a letter sheet and trim the card out; turning on cut lines adds a dashed guide to follow.",
      },
      {
        question: "What happens when a recipe is too long for one card?",
        answer:
          "The rest prints on the back of the same card instead of being cut short. Two-sided is on by default, so set your printer to print both sides flipped on the long edge and the front and back will line up.",
      },
      {
        question: "Can I fix a recipe before it prints?",
        answer:
          "Yes. The title, the ingredients, and the steps are editable right on the card, so you can correct an amount, drop a step you don't need, or reword a line before anything reaches the printer.",
      },
      {
        question: "Can I print a whole stack at once?",
        answer:
          "Yes, with RecipePrinter Pro. Add as many recipes as you like and print them in one job. The card size and the theme apply to every recipe waiting to print, so what comes out of the printer matches.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/recipe-binder", label: "Make a recipe binder" },
      { href: "/canva-recipe-card-alternative", label: "Canva alternative for recipe cards" },
    ],
  },
  {
    slug: "print-multiple-recipes",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-05",
    primaryKeyword: "print multiple recipes",
    secondaryKeywords: [
      "print multiple recipes at once",
      "how to print multiple recipes",
      "bulk print recipes",
    ],
    shortLabel: "Several recipes at once",
    pickerGroup: "output",
    intent: "Utility SEO",
    initialImportMode: "url",
    importModes: ["url", "apps", "image", "text"],
    importSubmitLabel: "Add your first recipe",
    heroImage: "card",
    cookbookPitch: true,
    title: "Print Multiple Recipes at Once | RecipePrinter",
    description:
      "Print multiple recipes at once with RecipePrinter. Combine recipes from websites, screenshots, photos, text, and recipe apps into one matching set.",
    h1: "Print multiple recipes at once",
    lede:
      "Add recipes from websites, screenshots, photos, recipe apps, and text to one collection. Choose a full-page or 4x6 card layout, then print multiple recipes at once.",
    howToHeading: "How to print multiple recipes",
    howTo: [
      {
        name: "Add your first recipe",
        text: "Paste the link to a recipe. You can also upload a screenshot or photo of it, bring it in from a recipe app, or paste in the text. Look it over, then add it to your collection.",
      },
      {
        name: "Add the rest of your recipes",
        text: "Keep adding recipes to the same collection, from any source. You'll need RecipePrinter Pro ($4.99/mo) to add a second recipe.",
      },
      {
        name: "Choose how they print",
        text: "Choose full letter pages or 4x6 recipe cards, then pick a theme. The same size and style apply to every recipe in the collection.",
      },
      {
        name: "Print or save the collection",
        text: "Print the whole collection together, or save it as one PDF to keep or print later.",
      },
    ],
    featureSections: [
      {
        heading: "One trip to the printer for the whole set",
        image: "multi-recipes",
        body:
          "Collect a week of dinners, a stack of recipe cards, or the family favorites you've been meaning to put on paper. Add and check each recipe, then print the entire collection at once instead of printing recipes one by one.",
        links: [{ phrase: "a week of dinners", href: "/print-meal-plan-recipes" }],
      },
      {
        heading: "Bring recipes from different places",
        image: "sources",
        body:
          "Your recipes don't have to come from the same website. Mix recipe links, screenshots, photos of handwritten cards, pasted text, and exports from supported recipe apps in one collection. Pick one size and one theme, and every recipe follows it, so what comes out of the printer still looks like a set.",
      },
    ],
    faqHeading: "Multiple recipe printing questions",
    faqs: [
      {
        question: "Can I print multiple recipes at once for free?",
        answer:
          "You can import and print recipes one at a time for free, as many as you like. Printing several together as one collection is part of RecipePrinter Pro.",
      },
      {
        question: "Can I print recipes from different websites, screenshots, and recipe apps together?",
        answer:
          "Yes. Recipes in the same collection can come from different websites, screenshots, photos, pasted text, or supported recipe apps. RecipePrinter reformats them so they print together. Check each one before printing so the ingredients and steps are right.",
      },
      {
        question: "Will every recipe use the same size and theme, including 4x6 cards?",
        answer:
          "Yes. Choose full letter pages or 4x6 recipe cards and a theme, and RecipePrinter applies them to every recipe in the collection, so the finished pages or cards match. If you want different sizes or themes, start a separate print project for each set.",
      },
      {
        question: "Can I save the collection as a PDF?",
        answer:
          "Yes. Once the recipes are ready, save the whole collection as one PDF to keep or print later.",
      },
      {
        question: "Do I need to add all the recipes at once?",
        answer:
          "No. Start with one recipe and keep adding to the collection. When it is ready, review the recipes, choose your layout, and print the entire set together.",
      },
    ],
    links: [
      { href: "/recipe-card-printer", label: "Make recipe cards" },
      { href: "/print-recipe-from-website", label: "Print a recipe from a website" },
      { href: "/family-recipe-book", label: "Build a family recipe book" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/print-meal-plan-recipes", label: "Print a week of dinners" },
    ],
  },
  {
    slug: "print-recipe-from-photo",
    contentUpdated: "2026-10-02",
    copyReviewed: "2026-10-02",
    primaryKeyword: "print a recipe from a photo",
    secondaryKeywords: [
      "print recipe from photo",
      "recipe photo to text",
      "convert recipe photo to text",
      "handwritten recipe to text",
      "digitize handwritten recipes",
      "recipe card from photo",
      "screenshot to printable recipe",
      "cookbook page to editable recipe",
    ],
    shortLabel: "A photo or screenshot",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "image",
    importSubmitLabel: "Read the photo",
    importPlaceholder: "Upload a recipe card, cookbook page, screenshot, or other recipe photo",
    // The template's default hero is a card captioned "Printed from a recipe
    // link", which is the one thing this page is not about.
    heroImage: "photo-recipe-card",
    heroImageAlt:
      "A printed Peanut Butter Blossoms recipe card lying on a vintage yellow spice chart.",
    heroAnnotation: "Printed from a photograph",
    cookbookPitch: true,
    cookbookPitchHeading: "Turn family recipe cards into a cookbook",
    cookbookPitchBody:
      "Once you’ve digitized the family recipes worth keeping, you can bring them together in a cookbook. Organize recipes into chapters, add a cover and table of contents, then print it at home or export the finished cookbook as a PDF.",
    title: "Print a Recipe From a Photo | RecipePrinter",
    description:
      "Upload a photo, screenshot, handwritten recipe card, or cookbook page. RecipePrinter turns it into editable text you can print as a 4x6 card or full page.",
    h1: "Print a recipe from a photo",
    anchor: "Print a recipe from a photo",
    lede:
      "Upload a photo, screenshot, handwritten recipe card, or cookbook page and turn it into editable recipe text. Check the ingredients and instructions, then print it as a 4x6 recipe card or full page.",
    howTo: [
      {
        name: "Photograph the recipe",
        text: "Take a clear photo of a handwritten recipe card, cookbook page, or printed recipe. A phone camera works well, so there’s no need to scan it first.",
      },
      {
        name: "Upload it",
        text: "Upload up to four photos for one recipe. Use multiple images when a recipe is written on both sides of a card or spans more than one cookbook page.",
      },
      {
        name: "Check the recipe",
        text: "RecipePrinter converts the recipe photo into editable text. Review the ingredients and instructions and fix anything that wasn’t read correctly.",
      },
      {
        name: "Print or save it",
        text: "Print the finished recipe as a 4x6 recipe card or full letter page, or save it as a PDF to keep for later.",
      },
    ],
    featureSections: [
      {
        heading: "Keep the card, cook from a copy",
        image: "handwritten-card",
        imageAlt:
          "A handwritten Peanut Butter Cookies recipe card beside the floral recipe box where it is kept.",
        body:
          "A handwritten recipe card holds more than the recipe: the handwriting, the notes in the margin, the marks from every time it was made. Digitize it from a photo and you get a typed copy to cook from, print again, and share with family, while the original stays safe in the recipe box.",
      },
      {
        heading: "Turn a recipe photo into editable text",
        image: "inline-editing",
        body:
          "A recipe photo is useful for keeping a copy, but editable text is easier to work with. RecipePrinter reads the ingredients and instructions so you can make corrections, format the recipe, print a recipe card, or save it as a PDF.",
      },
    ],
    faqHeading: "Recipe photo questions",
    faqs: [
      {
        question: "Does it read handwritten recipes?",
        answer:
          "Yes. RecipePrinter can read handwritten recipe cards as well as printed recipes. Clear handwriting and a well-lit photo give the best results, and you can review and edit the recipe before printing.",
      },
      {
        question: "What if the recipe runs onto the back of the card?",
        answer:
          "Photograph both sides and upload them together. You can add up to four photos to one recipe, which also works for cookbook recipes that span multiple pages.",
      },
      {
        question: "Do I need to scan the recipe?",
        answer:
          "No. A clear photo from your phone is enough. Place the recipe flat, use good lighting, and make sure the handwriting or printed text is easy to see.",
      },
      {
        question: "Can I convert a recipe photo to editable text?",
        answer:
          "Yes. RecipePrinter reads the recipe from the photo and turns the ingredients and instructions into editable text. You can review the result, make corrections, and then format or print the recipe.",
      },
      {
        question: "Can I turn a photo into a printable recipe card?",
        answer:
          "Yes. Upload a photo of the recipe, check the ingredients and instructions, then print it as a 4x6 recipe card or full letter page.",
      },
      {
        question: "Can I turn a screenshot of a recipe into a printable recipe?",
        answer:
          "Yes. Upload a recipe screenshot just like a photo. RecipePrinter reads the recipe from the image and turns it into editable text you can format and print.",
      },
    ],
    links: [
      { href: "/recipe-card-printer", label: "Recipe card printer" },
      { href: "/family-recipe-book", label: "Build a family recipe book" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
    ],
  },
  {
    slug: "print-recipe-from-screenshot",
    contentUpdated: "2026-10-02",
    copyReviewed: "2026-10-02",
    primaryKeyword: "print recipe from screenshot",
    secondaryKeywords: [
      "recipe screenshot to text",
      "convert recipe screenshot to text",
      "turn screenshot into recipe",
      "printable recipe from screenshot",
      "recipe screenshot printer",
      "turn recipe screenshot into recipe card",
      "save recipe screenshot as PDF",
    ],
    shortLabel: "A recipe screenshot",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "image",
    importFieldLabel: "Recipe screenshots",
    importUploadTitle: "Choose or drop screenshots",
    importPlaceholder: "Upload one or more screenshots that show the recipe ingredients and instructions",
    importSubmitLabel: "Read the screenshot",
    heroImage: "instagram",
    title: "Print a Recipe From a Screenshot | RecipePrinter",
    description:
      "Upload a recipe screenshot and turn it into editable ingredients and instructions. Print it as a full page, save it as a PDF, or make a 4x6 recipe card.",
    h1: "Print a recipe from a screenshot",
    lede:
      "Upload a recipe screenshot from a post, message, app, or website. RecipePrinter turns the visible ingredients and instructions into editable recipe text you can review, print, or save.",
    howToHeading: "How to print a recipe from a screenshot",
    howTo: [
      {
        name: "Save the recipe screenshot",
        text: "Take a screenshot that clearly shows the recipe ingredients and instructions. If the recipe spans multiple screens, save each part as a separate screenshot.",
      },
      {
        name: "Upload the recipe screenshots",
        text: "Upload the screenshots to RecipePrinter. You can add up to four images to one recipe when the ingredients and instructions span multiple screens.",
      },
      {
        name: "Review the recipe",
        text: "RecipePrinter converts the recipe screenshot into editable ingredients and instructions. Review the text and fix anything that wasn’t read correctly.",
      },
      {
        name: "Print or save it",
        text: "Print the finished recipe as a full letter page, save it as a PDF, or use RecipePrinter Pro to make a 4x6 recipe card.",
      },
    ],
    featureSections: [
      {
        heading: "Turn a recipe screenshot into text you can edit",
        image: "inline-editing",
        body:
          "A screenshot is an easy way to save a recipe, but the ingredients and instructions are still trapped inside an image. RecipePrinter converts the visible recipe into editable text so you can correct it, format it, and print it properly.",
      },
      {
        heading: "Print recipes from posts, messages, and apps",
        image: "steps",
        body:
          "Some recipes live in social posts, private groups, messages, or apps where there isn’t a useful recipe link to import. Upload screenshots instead and RecipePrinter can build an editable recipe from the ingredients and instructions visible on your screen.",
      },
    ],
    faqHeading: "Questions about printing recipes from screenshots",
    faqs: [
      {
        question: "Can RecipePrinter convert a recipe screenshot to text?",
        answer:
          "Yes. Upload the recipe screenshot and RecipePrinter converts the visible ingredients and instructions into editable text. You can review and correct the recipe before printing or saving it.",
      },
      {
        question: "What if the recipe takes more than one screenshot?",
        answer:
          "Upload the screenshots together. RecipePrinter can use up to four images for one recipe, so the ingredients and instructions can span multiple screens.",
      },
      {
        question: "Can I print a recipe from a private post or message?",
        answer:
          "Yes, as long as you can take a screenshot of the recipe. RecipePrinter reads the text in the image, so it does not need to open the original post, message, app, or webpage.",
      },
      {
        question: "Can I edit the recipe after the screenshot is converted?",
        answer:
          "Yes. You can edit the recipe title, ingredients, amounts, and instructions after the screenshot is converted and before you print or save the recipe.",
      },
      {
        question: "Can I print a recipe screenshot from my phone?",
        answer:
          "Yes. Open RecipePrinter in your phone browser, upload the recipe screenshot, review the ingredients and instructions, then print it or save it as a PDF.",
      },
      {
        question: "Can I turn a recipe screenshot into a recipe card?",
        answer:
          "Yes. Upload the screenshot, review the recipe, then choose a 4x6 recipe card layout with RecipePrinter Pro.",
      },
    ],
    links: [
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/recipe-card-printer", label: "Make a 4x6 recipe card" },
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
    ],
  },
  {
    slug: "print-pinterest-recipes",
    importFieldLabel: "Pinterest link",
    importPlaceholder: "Paste Pinterest link",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-07",
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
    faqHeading: "Pinterest recipe printing questions",
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
          "You add the pins one at a time, and then print them together as a single job with RecipePrinter Pro. So it's not one paste, but it is one trip to the printer instead of fifteen, and the card size and theme apply to every recipe waiting to print.",
      },
      {
        question: "Will the printed card still show where the recipe came from?",
        answer:
          "Yes. The original link prints on the card, so the recipe stays credited to the person who made it and is easy to find again. It's the recipe page's link when the pin leads to one, and the pin's own when it doesn't.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
    ],
  },
  {
    slug: "print-instagram-recipes",
    importFieldLabel: "Instagram link",
    importPlaceholder: "Paste Instagram link",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-09",
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
      "Paste an Instagram post or Reel link and turn the recipe in the caption into a printable recipe card, page, or PDF. Free, and no account needed.",
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
        text: "Paste the link into the box above. RecipePrinter opens the post and reads the recipe out of the caption.",
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
        heading: "Reels are for finding dinner, cards are for making it",
        image: "instagram",
        body:
          "Thirty seconds of a Reel tells you whether you want to eat it, which is what it's there for. Cooking is a different job: the caption folds behind a more link, and you lose your place every time you put the phone down. RecipePrinter reads that caption and sets it out as ingredients with their amounts and numbered steps, on one sheet that stays where you left it.",
      },
      {
        heading: "Saved posts were never meant to be a recipe box",
        image: "card-in-box",
        body:
          "Forty saved posts look much the same at a glance: a grid of good-looking dinners with nothing to say which one you actually loved. Printing makes you choose, and that is the useful part. What comes off the printer is the short list, and it goes where you cook, in a recipe box, a binder, or a folder by the stove.",
      },
      {
        heading: "The card outlasts the post",
        image: "counter-card",
        body:
          "Accounts go private, posts come down, and creators clear out old work, and none of that comes with any warning. A card that's already off the printer doesn't depend on the post it came from, or on you being able to find it again.",
      },
    ],
    faqHeading: "Instagram recipe printing questions",
    faqs: [
      {
        question: "Can I print a recipe from an Instagram Reel?",
        answer:
          "Yes. Copy the Reel's link and paste it in, and RecipePrinter reads the recipe out of the caption.",
      },
      {
        question: "Do I have to connect my Instagram account?",
        answer:
          "No. RecipePrinter never asks for access to your account, your saved posts, or who you follow. It works from a link you paste, so nothing is connected and nothing is synced.",
      },
      {
        question: "Will the card credit the creator?",
        answer:
          "Yes. The post's link prints on the card, so the person whose recipe it is stays attached to it and the Reel is easy to find again.",
      },
      {
        question: "Can I print several Instagram recipes at once?",
        answer:
          "Yes, with RecipePrinter Pro. Add them one at a time, then print them together as a single job. The card size and the theme apply to every recipe waiting to print, so a week of dinners comes out matching.",
      },
      {
        question: "Can I still get the recipe if the post is gone?",
        answer:
          "Not from the link. Once a post is down there's nothing left for RecipePrinter to read, which is the case for printing it while it's there. If you'd rather not print straight away, save the PDF and the recipe is yours either way.",
      },
    ],
    links: [
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
    ],
  },
  {
    slug: "print-facebook-recipes",
    importFieldLabel: "Facebook link",
    importPlaceholder: "Paste Facebook link",
    heroImage: "buffalo-chicken",
    heroAnnotation: "Printed from Facebook link",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-16",
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
    title: "Print Recipes from Facebook | RecipePrinter",
    description:
      "Paste a Facebook post or Reel link and turn the recipe into a clean printable page or 4×6 recipe card, even when the recipe is in the post image.",
    h1: "Print recipes from Facebook",
    lede:
      "Paste a Facebook post or Reel link and RecipePrinter turns the recipe into a clean page or 4×6 card. It can read from the post, a linked recipe, or the image itself.",
    howToHeading: "How to print a recipe from Facebook",
    howTo: [
      {
        name: "Copy the Facebook post or Reel link",
        text: "Open the post, tap Share or the three dots, and copy the link. That’s all you need to get started.",
      },
      {
        name: "Paste it into RecipePrinter",
        text: "Paste the Facebook link into RecipePrinter. It looks for the recipe in the post or any recipe link attached to it.",
      },
      {
        name: "RecipePrinter finds the recipe",
        text: "It pulls out the ingredients and steps. If the recipe is only shown in an image, RecipePrinter can read that too.",
      },
      {
        name: "Print it your way",
        text: "Print a full letter page for free or save it as a PDF. Pro adds 4×6 recipe cards and batch printing.",
      },
    ],
    featureSections: [
      {
        heading: "The recipe isn’t always in the same place",
        image: "steps",
        body:
          "Some Facebook recipes are typed into the caption. Others link to a recipe site, and some put the ingredients and directions right in the photo. Whether the recipe is in the caption, behind a link, or written into the image, RecipePrinter pulls it into the same clean format.",
      },
      {
        heading: "Keep the good ones from getting lost in the feed",
        image: "counter-card",
        body:
          "A good recipe shared in a group can be hard to find again a few weeks later. Once you print it or save it as a PDF, you no longer have to remember who posted it, what the post was called, or how far back in the group it lives.",
      },
      {
        heading: "Private post? You still have options",
        image: "paste-in-app",
        body:
          "RecipePrinter may not be able to open a Facebook post that only group members can see. In that case, copy and paste the recipe text instead, or upload a screenshot of the recipe. You still end up with the same clean printable format.",
      },
      {
        heading: "Keep the recipes worth coming back to",
        image: "bound-cookbook",
        body:
          "Facebook groups are full of recipes you might only see once. Printing the good ones gives them somewhere more permanent to live, whether that is a recipe box, a binder, or eventually a family cookbook.",
      },
    ],
    faqHeading: "Facebook recipe printing questions",
    faqs: [
      {
        question: "Can I print recipes from Facebook Reels?",
        answer:
          "Yes. Paste the Reel link into RecipePrinter. It can read the recipe from the Reel caption, a linked recipe, or the image when needed.",
      },
      {
        question: "What if the recipe is only shown in a photo?",
        answer:
          "RecipePrinter can fall back to reading the recipe from the image when the ingredients or directions are not available as normal post text.",
      },
      {
        question: "What about recipes posted in private Facebook groups?",
        answer:
          "Private posts may not be accessible from the link alone. Copy and paste the recipe text or upload a screenshot instead.",
      },
      {
        question: "Do I need to connect my Facebook account?",
        answer:
          "No. RecipePrinter does not need access to your Facebook account, groups, or saved posts. You provide the post link, text, or image you want to use.",
      },
      {
        question: "Can I print a Facebook recipe from my phone?",
        answer:
          "Yes. Copy the Facebook post link, open RecipePrinter in your browser, paste it in, and then print or save the finished recipe as a PDF.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-youtube-recipes", label: "Print YouTube recipes" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
    ],
  },
  {
    slug: "print-tiktok-recipes",
    importFieldLabel: "TikTok link",
    importPlaceholder: "Paste TikTok link",
    heroImage: "crunchwrap",
    heroImageAlt:
      "A printed Crunchwrap Supreme recipe card beside the finished crunchwrap.",
    heroAnnotation: "Printed from TikTok video",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "print TikTok recipes",
    secondaryKeywords: [
      "print recipe from TikTok",
      "TikTok recipe printer",
      "TikTok recipe to text",
      "TikTok recipe to printable recipe",
      "TikTok recipe to PDF",
      "TikTok recipe card",
      "recipe from TikTok video",
      "save TikTok recipes",
    ],
    shortLabel: "TikTok",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Print TikTok Recipes | RecipePrinter",
    description:
      "Paste a TikTok recipe link and turn the caption, available spoken captions, or on-screen recipe text into an editable recipe you can print or save.",
    h1: "Print TikTok recipes",
    lede:
      "Paste a TikTok recipe link and RecipePrinter looks for the recipe in the caption, available spoken captions, and text shown in the video. Review the ingredients and instructions, then print it as a full page, save it as a PDF, or make a 4x6 recipe card.",
    howToHeading: "How to print a recipe from TikTok",
    howTo: [
      {
        name: "Copy the TikTok link",
        text: "Open the TikTok recipe, tap Share, then choose Copy link. That link is all you need to get started.",
      },
      {
        name: "Paste it into RecipePrinter",
        text: "Paste the TikTok link into RecipePrinter. It first checks the caption, then may use available spoken captions and recipe text shown on screen when needed.",
      },
      {
        name: "Review the recipe",
        text: "RecipePrinter turns the recipe it can find into editable ingredients and instructions. Review the result and fix anything that was missed or read incorrectly.",
      },
      {
        name: "Print it your way",
        text: "Print a full letter page, save the recipe as a PDF, or use RecipePrinter Pro to make a 4x6 recipe card.",
      },
    ],
    featureSections: [
      {
        heading: "Turn a TikTok recipe into something easier to cook from",
        image: "counter-card",
        imageAlt:
          "A printed Buffalo Chicken Bake recipe card on a kitchen counter beside its ingredients.",
        body:
          "TikTok is great for seeing how a recipe comes together, but replaying a video every time you need an ingredient amount or step gets old quickly. RecipePrinter turns the recipe it can read from the video into an editable version you can keep in front of you while you cook.",
      },
      {
        heading: "Find the recipe beyond the TikTok caption",
        image: "tiktok-import",
        imageAlt:
          "A TikTok recipe imported into RecipePrinter with editable ingredients and instructions.",
        body:
          "Some creators put the full recipe in the caption, while others explain it aloud or show ingredients and amounts on screen. RecipePrinter can use the caption first, then available spoken captions and on-screen recipe text to help build the recipe.",
      },
      {
        heading: "Keep TikTok recipes from getting lost in your saved videos",
        image: "card-in-box",
        imageAlt: "A printed Basil Pesto recipe card filed in a tabbed recipe box.",
        body:
          "Saving a TikTok recipe takes one tap. Finding the exact video again months later can be much harder. Print the recipes you want to keep so they have a permanent place in your recipe box, binder, or cookbook.",
      },
      {
        heading: "What RecipePrinter can find varies by video",
        image: "inline-editing",
        imageAlt: "An imported recipe open for editing before it is printed.",
        body:
          "RecipePrinter can use available caption text, spoken captions, and recipe text shown in the video, but not every TikTok exposes the same information. Review the recipe before printing to make sure the ingredients and instructions are complete.",
      },
    ],
    faqHeading: "TikTok recipe printing questions",
    faqs: [
      {
        question: "Can I print a recipe from a TikTok video?",
        answer:
          "Yes. Paste the TikTok link and RecipePrinter looks for the recipe in the caption, available spoken captions, and text displayed in the video. Review the ingredients and instructions before printing.",
      },
      {
        question: "Can RecipePrinter read ingredients spoken in a TikTok video?",
        answer:
          "Sometimes. RecipePrinter can use spoken narration when TikTok provides a usable caption or ASR track. Transcript availability varies, so review the recipe and add anything that is missing.",
      },
      {
        question: "Can RecipePrinter read recipe text shown on the TikTok video?",
        answer:
          "Yes. RecipePrinter can use recipe text displayed over the video when it is available and readable, along with other recipe information it finds.",
      },
      {
        question: "What happens if the TikTok recipe is deleted later?",
        answer:
          "Once you have printed the recipe or saved it as a PDF, your copy no longer depends on the original TikTok video staying online.",
      },
      {
        question: "Can I save a TikTok recipe as a PDF?",
        answer:
          "Yes. Once the recipe is formatted, print it and choose Save as PDF from your browser's print dialog.",
        answerEmphasis: "Save as PDF",
      },
      {
        question: "Do I need a TikTok account to use RecipePrinter?",
        answer:
          "No. RecipePrinter works from the TikTok link you provide. You do not need to connect or sign in to a TikTok account.",
      },
      {
        question: "Can I turn a TikTok recipe into a 4x6 recipe card?",
        answer:
          "Yes. Paste the TikTok link, review the recipe, then choose a 4x6 recipe card layout with RecipePrinter Pro.",
      },
    ],
    links: [
      { href: "/recipe-card-printer", label: "Make a 4x6 recipe card" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/family-recipe-book", label: "Build a family recipe book" },
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-youtube-recipes", label: "Print YouTube recipes" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
    ],
  },
  {
    slug: "print-paprika-recipes",
    contentUpdated: "2026-10-02",
    copyReviewed: "2026-10-02",

    primaryKeyword: "print Paprika recipes",
    secondaryKeywords: [
      "print recipe from Paprika",
      "Paprika recipe printer",
      "print Paprika recipe cards",
      "print Paprika cookbook",
      "print entire Paprika library",
      "Paprika recipe export",
      ".paprikarecipes file",
      "export Paprika recipes",
      "Paprika recipes to PDF",
    ],
    shortLabel: "Paprika",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "apps",
    importSubmitLabel: "Open a Paprika file",
    heroImage: "paprika-import",
    heroFrame: "none",
    title: "Print Recipes From Paprika | RecipePrinter",
    description:
      "Export your Paprika recipes, open the file in RecipePrinter, and print selected recipes as full pages or 4x6 recipe cards.",
    h1: "Print recipes from Paprika",
    anchor: "Print Paprika recipes",
    lede:
      "Export your Paprika recipe library, open the Paprika export in RecipePrinter, and choose the recipes you want to print. Make full-page recipes, save them as PDFs, or use RecipePrinter Pro to print 4x6 recipe cards.",
    howToHeading: "How to print recipes from Paprika",
    howTo: [
      {
        name: "Export from Paprika",
        text: "In Paprika, open Settings → Export Recipes and export the recipes you want to print. You can export your full library or a smaller set.",
      },
      {
        name: "Open the export in RecipePrinter",
        text: "Drop the Paprika export into RecipePrinter. The file is read in your browser so you can browse the recipes it contains.",
      },
      {
        name: "Choose the recipes you want",
        text: "Browse the imported recipes and select the ones you actually want to print. You do not have to print the entire library.",
      },
      {
        name: "Print recipes as pages or cards",
        text: "Print recipes as full letter pages, save them as PDFs, or use RecipePrinter Pro to make 4x6 recipe cards and print multiple recipes together.",
      },
    ],
    featureSections: [
      {
        heading: "Keep the recipe details from your Paprika export",
        image: "paste-in-app",
        body:
          "Your Paprika export includes more than just the recipe name. RecipePrinter brings over the recipe details it can read from the export, including ingredients, instructions, timing, servings, source, named categories, and notes, so you do not have to rebuild each recipe by hand.",
      },
      {
        heading: "Print the Paprika recipes you actually want to keep",
        image: "card-in-box",
        body:
          "You do not have to print your entire Paprika library. Choose the recipes you come back to most and turn them into printable pages, 4x6 recipe cards, or a cookbook you can keep on the shelf.",
      },
      {
        heading: "Print your whole Paprika library or just a few recipes",
        image: "bound-cookbook",
        body:
          "Export a large Paprika collection and decide what to print after you open it in RecipePrinter. Choose just a few recipes, or use RecipePrinter Pro to print multiple recipes together for a recipe box or binder. The cookbook builder is a separate purchase for turning an imported collection into a cookbook.",
      },
    ],
    faqHeading: "Questions about printing recipes from Paprika",
    faqs: [
      {
        question: "What file does Paprika export?",
        answer:
          "Paprika can export recipes in a .paprikarecipes file that contains the recipes and their saved details. Open that export in RecipePrinter to browse and print the recipes inside.",
      },
      {
        question: "Does my Paprika library get uploaded?",
        answer:
          "No. RecipePrinter reads the Paprika export in your browser on your device, so the file does not need to be uploaded to a server.",
      },
      {
        question: "Can I print my entire Paprika recipe library?",
        answer:
          "Yes. You can open a Paprika library export and work with all of the recipes it contains. RecipePrinter Pro lets you add multiple recipes to a print queue, or you can choose only the recipes you want.",
      },
      {
        question: "What recipe details come over from Paprika?",
        answer:
          "RecipePrinter can bring over the title, ingredients, instructions, prep and cook time, servings, source, named categories, and notes from the Paprika export. Ratings and difficulty are not preserved.",
      },
      {
        question: "Can I print Paprika recipes as 4x6 recipe cards?",
        answer:
          "Yes. Open your Paprika export, choose the recipe you want, then use RecipePrinter Pro to print it as a 4x6 recipe card.",
      },
      {
        question: "Can I save Paprika recipes as PDFs?",
        answer:
          "Yes. Open the recipe in RecipePrinter, format it for printing, then choose Save as PDF from your browser’s print dialog.",
      },
    ],
    links: [
      { href: "/organize-recipes", label: "Organize recipes" },
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
      { href: "/recipe-binder", label: "Make a recipe binder" },
      { href: "/family-recipe-book", label: "Build a family cookbook" },
    ],
  },
  {
    slug: "print-youtube-recipes",
    importFieldLabel: "YouTube link",
    importPlaceholder: "Paste YouTube link",
    heroImage: "souvlaki",
    heroAnnotation: "Printed from YouTube video",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "print recipe from YouTube",
    secondaryKeywords: [
      "print YouTube recipes",
      "YouTube recipe printer",
      "YouTube recipe to text",
      "YouTube recipe to printable recipe",
      "print recipe from YouTube video",
      "recipe from YouTube transcript",
      "print recipe from YouTube Short",
      "YouTube recipe to PDF",
      "YouTube recipe card",
    ],
    shortLabel: "YouTube",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "url",
    title: "Print a Recipe From YouTube | RecipePrinter",
    description:
      "Paste a YouTube recipe link and turn the description, linked recipe, or available video captions into an editable recipe you can print or save.",
    h1: "Print a recipe from YouTube",
    lede:
      "Paste a YouTube recipe link and RecipePrinter looks for the recipe in the video description, a linked recipe page, or available captions. Review the ingredients and instructions, then print it as a full page, save it as a PDF, or make a 4x6 recipe card.",
    howToHeading: "How to print a recipe from YouTube",
    howTo: [
      {
        name: "Copy the YouTube video link",
        text: "Open the YouTube recipe video, tap Share, and copy the link. You can also copy the video URL directly from your browser.",
      },
      {
        name: "Paste it into RecipePrinter",
        text: "Paste the YouTube link into RecipePrinter. It checks the video description and any usable linked recipe page, and may use available captions when more recipe information is needed.",
      },
      {
        name: "Review the recipe",
        text: "RecipePrinter turns the recipe it finds into editable ingredients and instructions. Review the result and fix anything that was missed or read incorrectly.",
      },
      {
        name: "Print it your way",
        text: "Print a full letter page, save the recipe as a PDF, or use RecipePrinter Pro to make a 4x6 recipe card.",
      },
    ],
    featureSections: [
      {
        heading: "Print the recipe from a YouTube video",
        image: "youtube-import",
        body:
          "YouTube cooking videos are useful for seeing how a recipe is made, but the actual recipe may be spread across the description, a linked website, or spoken captions. RecipePrinter brings the available ingredients and instructions into one editable recipe you can print.",
      },
      {
        heading: "Cook from a printed recipe instead of replaying the video",
        image: "counter-card",
        body:
          "Cooking videos are great for watching a technique, but less convenient when you need to check an ingredient amount or step while cooking. A printed recipe keeps the ingredients and instructions in front of you without replaying or scrubbing through the video.",
      },
      {
        heading: "Keep the YouTube video linked to the recipe",
        image: "pdf-search",
        body:
          "RecipePrinter keeps the original YouTube URL as the recipe source, so you can cook from the written recipe and return to the video whenever you want to watch a technique again.",
      },
      {
        heading: "The recipe may be in the description, website, or captions",
        image: "before-after",
        body:
          "Some creators write the full recipe in the YouTube description. Others link to a recipe on their website or explain the recipe in the video. RecipePrinter checks the available written sources and can use a usable YouTube caption track when needed.",
      },
    ],
    faqHeading: "YouTube recipe printing questions",
    faqs: [
      {
        question: "Can I print a recipe from a YouTube cooking video?",
        answer:
          "Yes. Paste the YouTube link and RecipePrinter looks for recipe information in the video description, a linked recipe page, and available captions. Review the recipe before printing.",
      },
      {
        question: "Can RecipePrinter use a recipe that is only explained in the video?",
        answer:
          "Sometimes. If YouTube provides a usable caption or transcript track, RecipePrinter can use the spoken narration to help build the recipe. Captions are not available for every video, so review the result for anything missing.",
      },
      {
        question: "Can I print a recipe from a YouTube Short?",
        answer:
          "Yes. Paste the YouTube Short link the same way you would another video. RecipePrinter can use available transcript information when the Short's description does not contain enough recipe detail.",
      },
      {
        question: "Can RecipePrinter use a recipe linked in the YouTube description?",
        answer:
          "Yes. If the description links to a usable recipe page, RecipePrinter can use that written recipe to build the printable version.",
      },
      {
        question: "Can I save a YouTube recipe as a PDF?",
        answer:
          "Yes. Once the recipe is formatted, print it and choose Save as PDF from your browser's print dialog.",
        answerEmphasis: "Save as PDF",
      },
      {
        question: "Will the printed recipe link back to the YouTube video?",
        answer:
          "RecipePrinter keeps the original YouTube URL as the recipe source, so you can return to the video later when you want to watch a technique again.",
      },
      {
        question: "Can I turn a YouTube recipe into a 4x6 recipe card?",
        answer:
          "Yes. Paste the YouTube link, review the recipe, then choose a 4x6 recipe card layout with RecipePrinter Pro.",
      },
    ],
    links: [
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
      { href: "/convert-recipe-to-pdf", label: "Convert recipe to PDF" },
      { href: "/recipe-card-printer", label: "Make a 4x6 recipe card" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
    ],
  },
  {
    slug: "print-social-media-recipes",
    contentUpdated: "2026-10-05",
    primaryKeyword: "print recipes from social media",
    // Not the per-app phrases ("print TikTok recipes" and so on): each is
    // another page's primary, and this page links to all five instead.
    secondaryKeywords: [
      "print social media recipes",
      "save recipes from social media",
      "social media recipe printer",
      "print recipe from a reel",
      "keep recipes from social media",
    ],
    shortLabel: "Social media",
    pickerGroup: "source",
    intent: "Utility SEO",
    heroImage: "instagram",
    heroAnnotation: "Printed from an Instagram post",
    initialImportMode: "url",
    importFieldLabel: "Post or video link",
    importPlaceholder: "Paste a post or video link",
    importHint:
      "If the link doesn't work, you can also paste the recipe text or upload a screenshot.",
    title: "Print Recipes from Social Media | Instagram, TikTok & More",
    description:
      "Print recipes from Instagram, TikTok, Pinterest, Facebook, and YouTube. Paste a social media link and turn it into a clean recipe you can print or save.",
    h1: "Print recipes from social media",
    anchor: "Print recipes from social media",
    lede:
      "Found a recipe on Instagram, TikTok, Pinterest, Facebook, or YouTube? Paste the post or video link and RecipePrinter turns it into a clean recipe with ingredients and instructions, ready to print or save.",
    hub: {
      label: "Guides for each app",
      slugs: [
        "print-instagram-recipes",
        "print-tiktok-recipes",
        "print-pinterest-recipes",
        "print-facebook-recipes",
        "print-youtube-recipes",
      ],
    },
    howToHeading: "How to print a recipe from social media",
    howTo: [
      {
        name: "Copy the post's link",
        text: "On Instagram, TikTok, Pinterest, Facebook, or YouTube, tap Share and copy the link to the post, Pin, Reel, or video.",
      },
      {
        name: "Paste it into RecipePrinter",
        text: "RecipePrinter looks for the recipe in the caption, description, linked page, and when available, the video's narration or on-screen text.",
      },
      {
        name: "Check the recipe",
        text: "Review the ingredients and instructions, then make any edits you want before printing.",
      },
      {
        name: "Print or save it",
        text: "Print a full-page recipe, save it as a PDF, or create a 4×6 recipe card with RecipePrinter Pro.",
      },
    ],
    featureSections: [
      {
        heading: "One box for every app",
        image: "tiktok-import",
        body:
          "Recipes are posted differently on every app. Instagram may put the recipe in a caption, TikTok might explain it in the video, and Pinterest may link to a blog.",
        afterBody:
          "You don't need to figure out where the recipe is first. Paste the link and RecipePrinter checks the places it could be.",
      },
      {
        heading: "Saved is not the same as kept",
        image: "card-in-box",
        body:
          "Saved posts are easy to lose in a folder full of hundreds of other recipes. A printed recipe is easier to find, cook from, and come back to.",
        afterBody: "Put it in a recipe box or binder and it's there when you need it.",
      },
      {
        heading: "Cook from paper, not from a paused video",
        image: "counter-card",
        body:
          "Videos are great for discovering recipes, but awkward to cook from. You end up pausing, rewinding, and touching your phone with messy hands.",
        afterBody:
          "RecipePrinter turns the recipe into ingredients and instructions you can keep on the counter while you cook. The original link stays with the recipe if you want to go back and watch the video.",
      },
    ],
    cookbookPitch: true,
    cookbookPitchBody:
      "Once you've saved enough recipes, you can turn them into a cookbook. Organize recipes into chapters, rearrange them, add section pages, and build the whole book in RecipePrinter. Then print it at home or export the finished PDF to have it printed anywhere.",
    cookbookPitchLink: { phrase: "turn them into a cookbook", href: "/make-your-own-cookbook" },
    faqHeading: "Social media recipe questions",
    faqs: [
      {
        question: "Which apps does it work with?",
        answer:
          "Instagram, TikTok, Pinterest, Facebook, and YouTube. Copy the link to the post, Pin, Reel, or video and paste it into the same box. Links to recipe websites work too.",
        links: [
          { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
          { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
          { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
          { href: "/print-facebook-recipes", label: "Print Facebook recipes" },
          { href: "/print-youtube-recipes", label: "Print YouTube recipes" },
        ],
      },
      {
        question: "What if the recipe is only in the video?",
        answer:
          "RecipePrinter checks the caption or description first. For TikTok and YouTube, it can also use the video's captions when they're available, and on TikTok, recipe text shown on screen. Not every video has these, so check the amounts before you print and add anything that's missing.",
      },
      {
        question: "Do I need to connect my accounts?",
        answer:
          "No. You never sign in to Instagram, TikTok, or any other app through RecipePrinter, and it never sees your saved posts or boards. It only works from the link, screenshot, or text you give it.",
      },
      {
        question: "What if a link won't open?",
        answer:
          "Posts from private accounts and members-only Facebook groups usually can't be read from a link. Copy the recipe text and paste it in, or upload a screenshot and RecipePrinter reads the recipe from the image.",
        links: [{ href: "/print-recipe-from-screenshot", label: "Print a recipe from a screenshot" }],
      },
      {
        question: "Can I print several saved recipes at once?",
        answer:
          "Yes, with RecipePrinter Pro. Add recipes one at a time from any app, then print them together in one job, with the same card size and theme on all of them. On the free plan, you print one recipe at a time.",
        links: [{ href: "/print-multiple-recipes", label: "Print multiple recipes at once" }],
      },
      {
        question: "Is it free?",
        answer: `Yes, for full-page recipes. Importing from a link, editing, and printing or saving a full-page recipe are free, with no account. RecipePrinter Pro (${PRO_MONTHLY_PRICE_FALLBACK} or ${PRO_ANNUAL_PRICE_FALLBACK}) adds 4×6 recipe cards, premium themes, and printing several recipes at once.`,
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
    ],
  },
  {
    slug: "screen-free-cooking",
    contentUpdated: "2026-10-05",
    primaryKeyword: "screen-free cooking",
    secondaryKeywords: [
      "cook without your phone",
      "cooking without a phone",
      "print recipes instead of using your phone",
      "printed recipes",
      "screen-free kitchen",
    ],
    shortLabel: "Cooking without a screen",
    intent: "Organization SEO",
    layout: "capture-first",
    heroImage: "counter-card",
    initialImportMode: "url",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Put it on paper",
    // The Link field already lists the apps and recipe sites under itself
    // (ImportPanel), so this names only what that line leaves out.
    importHint: "Screenshots, photos, and pasted recipe text work too.",
    title: "Screen-Free Cooking | Cook Without Your Phone",
    description:
      "Turn recipes from websites, social media, screenshots, and photos into printed recipes. Cook without keeping your phone open on the counter.",
    h1: "Cook without your phone",
    anchor: "Cook without your phone",
    lede:
      "Your phone is where recipes are found. It doesn't have to be where they're cooked. Turn recipes from websites, social media, screenshots, or photos into something you can print and keep in the kitchen.",
    howToHeading: "How to take your recipes off the screen",
    howTo: [
      {
        name: "Choose the recipes you actually cook",
        text: "Start with the recipes you come back to. Instead of keeping hundreds of saved posts and screenshots, put the ones you actually use on paper.",
      },
      {
        name: "Bring them in from wherever they are",
        text: "Paste a recipe link, upload a screenshot or photo, or paste the recipe text. RecipePrinter turns it into ingredients and instructions you can review.",
      },
      {
        name: "Print them",
        text: "Print a full-page recipe for a binder, save it as a PDF, or make a 4×6 recipe card with RecipePrinter Pro.",
      },
      {
        name: "Leave the phone in the other room",
        text: "Put the printed recipe where you cook. No notifications, no dimmed screen, and no unlocking your phone with messy hands.",
      },
    ],
    featureSections: [
      {
        heading: "Open the recipe and nothing else",
        image: "before-after",
        body:
          "Looking up a recipe on your phone also means opening notifications, messages, ads, and everything else fighting for your attention.",
        afterBody:
          "A printed recipe does one job. The ingredients and instructions stay open on the counter until you're done.",
      },
      {
        heading: "Paper doesn't sleep, ring, or need charging",
        image: "photo-recipe-card",
        body:
          "A screen dims halfway through a recipe. A phone rings. A clean finger turns into a messy one.",
        afterBody:
          "Paper stays open on the counter, takes a splash, and is still on the right step when you come back.",
      },
      {
        heading: "A recipe box instead of a camera roll",
        image: "card-in-box",
        body:
          "Saved recipes pile up out of sight. Screenshots disappear into your camera roll, and saved posts get buried under hundreds of others.",
        afterBody: [
          "Printed recipes give the ones you actually cook a place to live. Keep them in a recipe box or a recipe binder, and add to the collection over time.",
          "When the collection gets bigger, you can turn it into a cookbook.",
        ],
        links: [
          { phrase: "recipe binder", href: "/recipe-binder" },
          { phrase: "turn it into a cookbook", href: "/make-your-own-cookbook" },
        ],
      },
    ],
    faqHeading: "Questions about cooking without a screen",
    faqs: [
      {
        question: "Don't I need a phone to get the recipes onto paper?",
        answer:
          "Screen-free cooking doesn't mean never using a screen. You may use your phone or computer to bring the recipe into RecipePrinter, but once it's printed, the recipe lives on paper. Print a few at a time and build up a collection.",
      },
      {
        question: "What's the best way to keep printed recipes?",
        answer:
          "For full-page recipes, a binder with sheet protectors works well, and the sleeves keep the pages clean. For 4×6 recipe cards, use a recipe box or a card file.",
        links: [
          { href: "/recipe-binder", label: "Build a recipe binder" },
          { href: "/recipe-card-printer", label: "Make 4×6 recipe cards" },
        ],
      },
      {
        question: "Can I print recipes I've saved on Instagram or TikTok?",
        answer:
          "Yes. Paste the post's link into RecipePrinter. On Instagram, it reads the recipe from the caption. On TikTok, it checks the caption and, when the video has them, its spoken captions and on-screen text. Some posts don't include the full recipe, so check it before you print.",
        links: [
          { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
          { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
        ],
      },
      {
        question: "Can I print a recipe from a screenshot?",
        answer:
          "Yes. Upload a screenshot and RecipePrinter turns the recipe in the image into an editable recipe before you print it. Photos of handwritten recipe cards work the same way.",
        links: [{ href: "/print-recipe-from-screenshot", label: "Print a recipe from a screenshot" }],
      },
      {
        question: "Does it cost anything?",
        answer: `The basics are free with no account: importing recipes, editing them, and printing or saving full-page recipes, with up to ${IMAGE_IMPORTS_PER_HOUR_FREE} screenshot or photo imports an hour. RecipePrinter Pro (${PRO_MONTHLY_PRICE_FALLBACK} or ${PRO_ANNUAL_PRICE_FALLBACK}) adds 4×6 recipe cards, premium themes, printing several recipes at once, and ${IMAGE_IMPORTS_PER_HOUR_PRO} image imports an hour.`,
      },
    ],
    links: [
      { href: "/print-recipe-without-ads", label: "Print recipes without ads" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
      { href: "/print-meal-plan-recipes", label: "Print a week of dinners" },
    ],
  },
  {
    slug: "print-meal-plan-recipes",
    contentUpdated: "2026-10-05",
    primaryKeyword: "print meal plan recipes",
    // The step AFTER planning: RecipePrinter is not a meal planner or grocery
    // app (lib/seo.ts FAQ, llms.txt), so no "meal planner" terms here. And not
    // "print multiple recipes": /print-multiple-recipes owns the general
    // feature; this page owns this week's recipes, printed together.
    secondaryKeywords: [
      "print recipes for the week",
      "weekly meal plan recipes",
      "printable meal plan recipes",
      "weekly dinner recipes",
      "print recipes for meal prep",
    ],
    shortLabel: "A week of dinners",
    pickerGroup: "output",
    intent: "Organization SEO",
    layout: "capture-first",
    heroImage: "counter-card",
    initialImportMode: "url",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Add the first recipe",
    title: "Print Meal Plan Recipes for the Week | RecipePrinter",
    description:
      "Already planned your dinners? Add recipes from websites, social media, screenshots, or text and print the whole week's recipes together.",
    h1: "Print a week of dinners in one go",
    anchor: "Print a week of dinners",
    lede:
      "Plan the week however you like. Then add each recipe to RecipePrinter and print the whole week's dinners together, so the recipes are already on the counter when you need them.",
    howToHeading: "How to print your meal plan recipes",
    howTo: [
      {
        name: "Pick the week's recipes",
        text: "Choose the dinners wherever you normally plan them: a meal-planning app, a notebook, saved posts, recipe sites, or your own recipes.",
      },
      {
        name: "Add each one",
        text: "Paste a recipe link, upload a screenshot or photo, or paste the recipe text. Review the ingredients and instructions, then add the next recipe.",
      },
      {
        name: "Print them together",
        text: "With RecipePrinter Pro, print the week's recipes in one batch instead of opening and printing each recipe separately.",
      },
      {
        name: "Keep them where you cook",
        text: "Clip them to the fridge, leave them on the counter, or file them in a binder. When it's time to cook, the recipe is already there.",
      },
    ],
    featureSections: [
      {
        heading: "One print job, not five",
        image: "card",
        imageAlt:
          "Five printed recipe cards in different designs fanned across a counter, enough for a week of dinners.",
        body:
          "Opening, cleaning up, and printing five recipes one at a time is the part that's easy to put off.",
        afterBody: [
          "With RecipePrinter Pro, you add the recipes for the week and print them together in one batch.",
          "Full-page recipes can still be printed one at a time for free.",
        ],
      },
      {
        heading: "The week's dinners, on the counter",
        image: "photo-recipe-card",
        body:
          "When dinner is already printed, nobody has to find the right tab, unlock a phone, or scroll past the story to reach the ingredients.",
        afterBody: "The week's recipes can stay somewhere everyone in the house can see them.",
      },
      {
        heading: "Favorites come back around",
        image: "card-in-box",
        body:
          "Most weeks repeat at least a few favorite dinners. Keep the recipes you use most in a binder or recipe box, and next time they're on the meal plan you won't have to find them again.",
        links: [{ phrase: "binder", href: "/recipe-binder" }],
      },
    ],
    faqHeading: "Meal plan printing questions",
    faqs: [
      {
        question: "Does RecipePrinter plan my meals or make a grocery list?",
        answer:
          "No. RecipePrinter doesn't choose your meals or build a grocery list. Plan the week in whatever app, notebook, or calendar you already use, then bring the recipes into RecipePrinter to print.",
      },
      {
        question: "Can I print the whole week at once?",
        answer:
          "Yes. RecipePrinter Pro lets you print multiple recipes at once: add each of the week's recipes, then print them together in one batch, with the same size and theme on all of them.",
        links: [{ href: "/print-multiple-recipes", label: "Print multiple recipes at once" }],
      },
      {
        question: "Can I mix recipes from websites, social media, and screenshots?",
        answer:
          "Yes. The recipes in one batch can come from different places. Paste links from recipe sites or social posts, upload screenshots or photos, or add recipe text, and they all print in the same layout.",
        links: [{ href: "/print-social-media-recipes", label: "Print recipes from social media" }],
      },
      {
        question: "Should I print full pages or recipe cards?",
        answer:
          "Full-page recipes are easier to read from across the kitchen and work well in a binder. 4×6 cards suit recipes you make often and want to keep in a recipe box; they need RecipePrinter Pro.",
        links: [
          { href: "/recipe-card-printer", label: "Make printable recipe cards" },
          { href: "/recipe-binder", label: "Build a recipe binder" },
        ],
      },
      {
        question: "Is it free?",
        answer: `Importing recipes and printing a full-page recipe are free, one recipe at a time, with no account. Printing several recipes in one batch, 4×6 cards, and premium themes are RecipePrinter Pro, ${PRO_MONTHLY_PRICE_FALLBACK} or ${PRO_ANNUAL_PRICE_FALLBACK}.`,
      },
    ],
    links: [
      { href: "/print-multiple-recipes", label: "Print multiple recipes at once" },
      { href: "/screen-free-cooking", label: "Cook without your phone" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/print-social-media-recipes", label: "Print recipes from social media" },
    ],
  },
  {
    slug: "organize-recipes",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    captureHeading: "Start with one recipe",
    importSubmitLabel: "Add your first recipe",
    initialImportMode: "url",
    importModes: ["url", "apps", "image", "text"],
    layout: "capture-first",
    primaryKeyword: "organize recipes",
    secondaryKeywords: [
      "how to organize recipes",
      "organize recipes from different places",
      "organize online recipes",
      "organize printed recipes",
      "recipe organization ideas",
      "recipe binder",
      "recipe box",
      "organize recipes digitally and on paper",
      "print saved recipes",
      "organize family recipes",
    ],
    cookbookPitch: true,
    shortLabel: "An organized collection",
    pickerGroup: "output",
    intent: "Organization SEO",
    title: "How to Organize Recipes | RecipePrinter",
    description:
      "Organize recipes from websites, social media, screenshots, photos, apps, and handwritten cards into a consistent format for printing.",
    h1: "Organize your recipes",
    lede:
      "Bring recipes from websites, social media, screenshots, photos, apps, and handwritten cards into one place. Then print matching recipe pages or cards for a binder, recipe box, or cookbook.",
    howToHeading: "How to organize recipes from different places",
    howTo: [
      {
        name: "Bring your recipes into one place",
        text: "Paste a recipe link, upload a screenshot or photo, import from a recipe app, or add recipe text. RecipePrinter helps bring recipes from different sources into the same collection.",
      },
      {
        name: "Choose the recipes worth keeping",
        text: "Pick the recipes you actually come back to and turn them into clean printable copies instead of leaving them scattered across bookmarks, apps, and saved posts.",
      },
      {
        name: "Choose a consistent recipe format",
        text: "Use 4x6 recipe cards with RecipePrinter Pro for a recipe box, or print full letter pages for a binder. Keeping one format makes the collection easier to browse and add to over time.",
      },
      {
        name: "Give every printed recipe a permanent place",
        text: "Store printed recipes in a recipe box, binder, or cookbook as soon as you print them so the collection stays organized instead of turning into another stack of paper.",
      },
    ],
    featureSections: [
      {
        heading: "Organize recipes saved across websites, apps, and social media",
        image: "cookpilot-export",
        body:
          "Recipes tend to end up everywhere: browser bookmarks, Pinterest boards, saved social posts, recipe apps, screenshots, photos, and handwritten cards. RecipePrinter brings those different sources into one workflow so you can turn the recipes you want to keep into a consistent printed collection.",
      },
      {
        heading: "Organize printed recipes in a recipe box or binder",
        image: "card-in-box",
        body:
          "4x6 recipe cards from RecipePrinter Pro work well in a recipe box with dividers, while full letter pages fit naturally into a three-ring binder. Choose the format that matches how you cook, then keep new recipes in the same format so the collection stays easy to browse.",
      },
      {
        heading: "Keep digital copies of your printed recipes too",
        image: "pdf-search",
        body:
          "Paper and digital recipes do not have to be an either-or choice. Save a PDF copy of a recipe alongside the printed version so you can search or share it later while still keeping a paper copy in the kitchen.",
      },
    ],
    cookbookPitchHeading: "Turn an organized recipe collection into a cookbook",
    cookbookPitchBody:
      "Once you have a collection of recipes worth keeping, you can bring them together in a cookbook. Organize recipes into chapters, add a cover and table of contents, and export the finished cookbook as a PDF or print it at home.",
    faqHeading: "Questions about organizing recipes",
    faqs: [
      {
        question: "What is the easiest way to organize online recipes?",
        answer:
          "Bring the recipes you actually want to keep into one consistent system instead of trying to organize every saved link. RecipePrinter can turn recipe links, screenshots, photos, app imports, and pasted text into printable recipes for a binder, recipe box, or cookbook.",
      },
      {
        question: "What categories should I use for a recipe binder?",
        answer:
          "Start with broad categories that match how you cook, such as breakfast, mains, sides, baking, desserts, and drinks. Add more sections only when a category becomes large enough to need them.",
        links: [
          { href: "/recipe-binder", label: "Recipe binder ideas" },
        ],
      },
      {
        question: "Is it better to keep recipes digitally or on paper?",
        answer:
          "Both can work well together. A digital or PDF copy is easier to search and share, while a printed recipe is often easier to use in the kitchen. Keeping both gives you a backup without forcing you to cook from a screen.",
      },
      {
        question: "How do I organize recipes in a binder?",
        answer:
          "Print recipes in a consistent full-page format, group them into broad sections, and use dividers to make recipes easy to find. RecipePrinter can format recipes as printable pages so new recipes can be added to the same collection over time.",
        links: [
          { href: "/recipe-binder", label: "Recipe binder ideas" },
          { href: "/recipe-card-printer", label: "Printable recipe cards" },
        ],
      },
      {
        question: "How should I store printed recipes?",
        answer:
          "Use a recipe box for 4x6 cards or a three-ring binder with sheet protectors for full-page recipes. Keeping each recipe in a permanent place also makes it easier to maintain the collection over time.",
      },
      {
        question: "Do I need an account to keep a collection together?",
        answer:
          "No account is needed to build or print a collection. When browser storage is available, RecipePrinter keeps an on-device recovery copy in that browser. Sign in to save qualifying multi-recipe projects and cookbooks to your account and access them across devices.",
      },
    ],
    links: [
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/print-paprika-recipes", label: "Print Paprika recipes" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/recipe-card-printer", label: "Printable recipe cards" },
      { href: "/family-recipe-book", label: "Build a family cookbook" },
      { href: "/print-meal-plan-recipes", label: "Print a week of dinners" },
    ],
  },
  {
    slug: "recipe-binder",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    layout: "capture-first",
    initialImportMode: "url",
    importModes: ["url", "apps", "image", "text"],
    primaryKeyword: "how to make a recipe binder",
    secondaryKeywords: [
      "recipe binder",
      "recipe binder ideas",
      "how to organize recipes in a binder",
      "organize recipes in a binder",
      "recipe binder organization",
      "recipe binder categories",
      "printable recipe binder",
      "recipe binder pages",
      "recipe binder printables",
      "family recipe binder",
      "recipe binder from online recipes",
    ],
    shortLabel: "A binder",
    pickerGroup: "output",
    intent: "Organization SEO",
    title: "Recipe Binder Ideas & Printable Pages | RecipePrinter",
    description:
      "Build a recipe binder from recipes you find online, in apps, screenshots, photos, or handwritten cards. Print consistent pages and organize them your way.",
    h1: "Build a recipe binder from the recipes you actually use",
    breadcrumbLabel: "Recipe binder",
    anchor: "Make a recipe binder",
    lede:
      "Turn recipes from websites, social media, screenshots, photos, apps, and handwritten cards into clean printable pages for a recipe binder you can keep adding to over time.",
    faqHeading: "Recipe binder questions",
    faqs: [
      {
        question: "Should a recipe binder use cards or full pages?",
        answer:
          "Full letter pages are usually the simplest choice for a recipe binder because they fit standard sheet protectors and give longer recipes more room. 4x6 cards work better in a recipe box, though you can still store cards in binder sleeves made for that size. 4x6 recipe cards are available with RecipePrinter Pro.",
      },
      {
        question: "Can I make a binder from recipes I found online?",
        answer:
          "Yes. RecipePrinter can turn recipes from websites, social media, screenshots, photos, recipe apps, and handwritten cards into consistent printable pages you can add to the same binder.",
      },
      {
        question: "What size binder is best for recipes?",
        answer:
          "A standard US Letter three-ring binder is the simplest choice for recipes printed at home. It works with common sheet protectors and gives longer recipes enough room.",
      },
      {
        question: "How should I organize recipes in a binder?",
        answer:
          "Start with broad categories you already use when deciding what to cook, such as breakfast, main dishes, sides, baking, and desserts. Add or split sections later as your collection grows.",
        links: [
          { href: "/organize-recipes", label: "More recipe organization ideas" },
        ],
      },
      {
        question: "How do I make printable recipe binder pages?",
        answer:
          "Paste a recipe link, upload a screenshot or photo, import from a supported recipe app, or add the recipe text. RecipePrinter formats the recipe into a clean printable page you can add to a binder.",
      },
      {
        question: "Can I print multiple recipes for my binder at once?",
        answer:
          "Yes, with RecipePrinter Pro. You can also print recipes one at a time for free and add them to your binder manually.",
      },
      {
        question: "Do I need RecipePrinter Pro to make a recipe binder?",
        answer:
          "No. You can print individual full-page recipes one at a time and organize them in a binder yourself. RecipePrinter Pro is useful when you want to work with multiple recipes together or use Pro-only formats such as 4x6 recipe cards.",
      },
    ],
    links: [
      { href: "/organize-recipes", label: "Organize recipes" },
      { href: "/print-paprika-recipes", label: "Print Paprika recipes" },
      { href: "/recipe-card-printer", label: "Printable recipe cards" },
      { href: "/family-recipe-book", label: "Family recipe book ideas" },
      { href: "/screen-free-cooking", label: "Cook without your phone" },
    ],
  },
  {
    slug: "digitize-recipe-cards",
    contentUpdated: "2026-10-02",
    copyReviewed: "2026-10-02",
    primaryKeyword: "digitize recipe cards",
    secondaryKeywords: [
      "scan recipe cards",
      "scan handwritten recipes",
      "recipe card scanner",
      "digitize handwritten recipes",
      "convert handwritten recipe to text",
      "handwritten recipe to text",
      "preserve handwritten recipes",
      "preserve family recipes",
      "old recipe cards",
      "turn handwritten recipe into printable recipe",
    ],
    shortLabel: "Handwritten recipe cards",
    pickerGroup: "source",
    intent: "Utility SEO",
    initialImportMode: "image",
    importFieldLabel: "Recipe card images",
    importUploadTitle: "Choose or drop photos",
    importPlaceholder:
      "Upload a photo or scan of your recipe card. Add the front and back together if the recipe continues onto both sides.",
    importSubmitLabel: "Digitize the card",
    heroImage: "handwritten-card",
    heroAnnotation: "Start with a photo of the card",
    title: "Digitize Recipe Cards & Handwritten Recipes | RecipePrinter",
    description:
      "Upload a photo or scan of a handwritten recipe card and turn it into editable recipe text you can print, save as a PDF, or keep for your family collection.",
    h1: "Digitize recipe cards",
    lede:
      "Turn handwritten recipe cards into clean, editable recipe text you can review, print, save as a PDF, or keep for your family collection. No retyping required.",
    howToHeading: "How to digitize a recipe card",
    howTo: [
      {
        name: "Photograph or scan the card",
        text: "Take a clear photo or scan of the entire recipe card. Keep the card flat, use good lighting, and make sure the handwriting is easy to see.",
      },
      {
        name: "Upload the recipe card images",
        text: "Upload the photo or scan to RecipePrinter. If the recipe continues onto the back or another card, add those images together as one recipe.",
      },
      {
        name: "Review the recipe",
        text: "RecipePrinter reads the handwriting and separates the recipe into editable ingredients and instructions. Review the result and correct anything that was hard to read.",
      },
      {
        name: "Print or save it",
        text: "Print the recipe as a full-page copy, save it as a PDF, or use RecipePrinter Pro to make a 4x6 recipe card.",
      },
    ],
    featureSections: [
      {
        heading: "Turn handwriting into an editable recipe",
        image: "inline-editing",
        body:
          "A photo preserves what the original recipe card looks like, but editable text is easier to use. RecipePrinter reads the handwriting and rebuilds the recipe as editable ingredients and instructions so you can correct faded words, fix amounts, and clean up the recipe before printing.",
        afterBody:
          "Instead of giving you one long block of text, RecipePrinter turns the card into a structured recipe that is easier to review, edit, print, and save.",
      },
      {
        heading: "Digitize both sides of a handwritten recipe card",
        body:
          "Older recipe cards often continue onto the back. Upload photos or scans of both sides together and RecipePrinter can treat them as one recipe instead of two separate cards.",
      },
      {
        heading: "Preserve old family recipes without cooking from the original",
        image: "card-in-box",
        body:
          "Keep the handwritten recipe card somewhere safe and use the clean RecipePrinter version for everyday cooking. You can print a fresh copy for a recipe box or binder while preserving the original handwriting, notes, stains, and history.",
      },
    ],
    cookbookPitch: true,
    cookbookPitchHeading: "Turn handwritten family recipes into a cookbook",
    cookbookPitchBody:
      "Once you have digitized the recipes worth keeping, you can bring them together into a family cookbook. Organize them into chapters, add a cover and table of contents, then print the finished collection or export it as a PDF. The cookbook builder is a separate one-off purchase.",
    faqHeading: "Recipe card digitizing questions",
    faqs: [
      {
        question: "Do I need a scanner to digitize recipe cards?",
        answer:
          "No. A clear phone photo works well. Lay the card flat, avoid shadows, and make sure the handwriting is easy to see.",
      },
      {
        question: "Can RecipePrinter read handwritten recipes?",
        answer:
          "Yes. RecipePrinter can read handwritten recipe cards, including many older or faded cards. Handwriting can still be difficult to interpret perfectly, so review and edit the recipe before printing or saving it.",
      },
      {
        question: "What if the recipe is written on both sides?",
        answer:
          "Upload photos or scans of the front and back together. RecipePrinter can use multiple images for one recipe so both sides are treated as the same recipe.",
      },
      {
        question: "Can I save a digitized recipe card as a PDF?",
        answer:
          "Yes. Once the recipe is formatted, print it and choose Save as PDF from your browser’s print dialog.",
      },
      {
        question: "Can I digitize old or faded recipe cards?",
        answer:
          "Yes. A clear photo is often enough, even when a card is faded or worn. Difficult handwriting or very faint text may need a little cleanup after the recipe is read.",
      },
      {
        question: "Can I convert a handwritten recipe to text?",
        answer:
          "Yes. RecipePrinter reads the handwritten recipe and turns the ingredients and instructions into editable text you can review, correct, print, or save.",
      },
      {
        question: "Can I digitize an entire recipe box?",
        answer:
          "Yes, a few cards at a time. Digitize each recipe as you work through the box, then print individual recipes or use RecipePrinter Pro when you want to work with multiple recipes together.",
      },
    ],
    links: [
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/family-recipe-book", label: "Family recipe book ideas" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/organize-recipes", label: "Organize recipes" },
    ],
  },
  {
    slug: "preserve-family-recipes",
    importPlaceholder: "Photograph a handwritten card, or drop a scan",
    contentUpdated: "2026-10-05",
    // Signed off on the writing. One image is still owed: "Keep the original,
    // cook from the copy" wants a photograph of the printed copy lying beside
    // the handwritten card it came from, which is the whole claim in one frame
    // and does not exist yet. It borrows `counter-card` until then, because the
    // hero already carries `handwritten-card` and a page should not show the
    // same photograph twice. Shoot that pair, register it in LandingVisuals,
    // and swap the key below.
    copyReviewed: "2026-09-03",
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
    title: "How to Preserve Family Recipes | RecipePrinter",
    description:
      "Preserve handwritten family recipes by turning old cards and photos into editable recipes you can print, save, and pass down.",
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
    faqHeading: "Questions about preserving family recipes",
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
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/reciscan-alternative", label: "ReciScan alternative" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/recipe-card-printer", label: "Make recipe cards" },
    ],
  },
  {
    slug: "family-recipe-book",
    contentUpdated: "2026-10-05",
    // Signed off on the writing. The three feature rows still ask for `photo`
    // and `book` proof kinds that have no image behind them, so they render as
    // text-only blocks: there is no finished family cookbook to photograph yet.
    // Register those two kinds in LandingVisuals when there is, and this page
    // picks them up with no edit here.
    copyReviewed: "2026-09-02",
    // Guide intent, but the input belongs at the top like everywhere else: a
    // book starts with one recipe, and asking for it below three sections of
    // explanation buried the only thing there is to do.
    layout: "capture-first",
    heroImage: "bound-cookbook",
    initialImportMode: "url",
    importModes: ["url", "apps", "image", "text"],
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
    title: "How to Make a Family Recipe Book | RecipePrinter",
    description:
      "Turn handwritten cards, photos, and favorite recipes into a family recipe book with chapters, a cover, table of contents, and printable PDF.",
    h1: "Family recipe book ideas",
    lede:
      "RecipePrinter turns online recipes, old cards, photos, and typed-in notes into clean, matching pages. Put them together in a cookbook with your own cover and chapters, and RecipePrinter builds the table of contents.",
    importSubmitLabel: "Start the cookbook",
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
    faqHeading: "Family recipe book questions",
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
      { href: "/make-your-own-cookbook", label: "Make your own cookbook" },
      { href: "/homemade-cookbook-gift", label: "Make a homemade cookbook gift" },
      { href: "/christmas-recipe-book", label: "Make a Christmas recipe book" },
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/print-recipe-from-photo", label: "Print a recipe from a photo" },
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/organize-recipes", label: "Organize recipes" },
      { href: "/how-to-print-a-cookbook", label: "How to print a cookbook" },
    ],
  },
  {
    slug: "make-your-own-cookbook",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "make your own cookbook",
    secondaryKeywords: [
      "create your own cookbook",
      "how to make a cookbook",
      "make a cookbook from your recipes",
      "how to make your own cookbook",
      "homemade cookbook",
      "custom cookbook from recipes",
      "family cookbook",
      "make a recipe book",
    ],
    shortLabel: "Your own cookbook",
    pickerGroup: "output",
    intent: "Organization SEO",
    layout: "capture-first",
    heroImage: "bound-cookbook",
    heroImageAlt: "A finished cookbook made from personal recipes, open to a full-page photograph and formatted recipe.",
    initialImportMode: "url",
    importModes: ["url", "apps", "image", "text"],
    importSubmitLabel: "Start my cookbook",
    title: "Make Your Own Cookbook From Your Recipes | RecipePrinter",
    description:
      "Turn your own recipes into a cookbook with chapters, a cover, table of contents, and page numbers. Print it at home or export a print-ready PDF.",
    h1: "Make your own cookbook",
    lede:
      "Turn the recipes you already use into your own cookbook. Import recipes from different places, organize them into chapters, customize the cover, and export a finished PDF you can print at home or send to a printer.",
    howToHeading: "How to make a cookbook from your recipes",
    howTo: [
      {
        name: "Collect the recipes you want to include",
        text: "Add recipes from websites, photos, screenshots, handwritten cards, recipe apps, or pasted text. Review each recipe and fix anything that needs attention before it goes into the book.",
      },
      {
        name: "Organize recipes into chapters",
        text: "Sort recipes into chapters, choose their order, and add chapter opener pages. RecipePrinter keeps the table of contents and page numbers aligned with the book as it changes.",
      },
      {
        name: "Customize the cover and pages",
        text: "Add a title, cover image, dedication, recipe notes, and photos where supported. Keep editing the cookbook until the collection feels finished.",
      },
      {
        name: "Export and print your cookbook",
        text: "Purchase the cookbook once, download the finished PDF, and print it at home or send the file to a professional printer. RecipePrinter creates the file but does not manufacture or ship the physical book.",
      },
    ],
    featureSections: [
      {
        heading: "Make a cookbook from recipes you already have",
        image: "cookpilot-export",
        imageAlt: "Recipes from different sources collected into one RecipePrinter project.",
        body:
          "Your recipes do not need to start in the same place. Bring together recipe links, screenshots, photos, handwritten cards, app imports, and recipes shared by family, then turn them into one consistent cookbook.",
        afterBody:
          "Each recipe stays editable, so you can correct old notes, clean up formatting, and make the collection feel like one book instead of a stack of unrelated recipes.",
      },
      {
        heading: "Organize your cookbook with chapters and a table of contents",
        body:
          "Group recipes into chapters and move them around as the book develops. RecipePrinter keeps the chapter structure, table of contents, and page numbers updated so you do not have to rebuild the layout every time something moves.",
        afterBody:
          "Chapter opener pages can also include a custom image and optional text.",
      },
      {
        heading: "Print your cookbook at home or with a professional printer",
        image: "bound-cookbook",
        imageAlt: "A finished cookbook ready for home or professional printing.",
        body:
          "Cookbook export costs $19.99 per cookbook. That one-time purchase unlocks the cookbook and lets you keep editing it and export updated PDFs again later.",
        afterBody:
          "Print the finished PDF at home or send it to a professional printing service for binding or hardcover printing. RecipePrinter provides the finished file rather than printing or shipping physical books. If you change a recipe, reorder a chapter, or add a family note later, you can update the same purchased cookbook and export a new version without buying that cookbook again.",
      },
    ],
    faqHeading: "Questions about making your own cookbook",
    faqs: [
      {
        question: "How do I make my own cookbook?",
        answer:
          "Collect the recipes you want to keep, import them into RecipePrinter, review and edit each recipe, organize them into chapters, customize the cover and pages, then export the finished cookbook as a PDF.",
      },
      {
        question: "Can I make a cookbook from recipes I already have?",
        answer:
          "Yes. Recipes can come from websites, photos, screenshots, handwritten recipe cards, pasted text, supported recipe apps, and other RecipePrinter imports. You can edit imported recipes before adding them to the cookbook.",
      },
      {
        question: "Can I print the cookbook at home?",
        answer:
          "Yes. Export the cookbook as a PDF and print the home-print format on your own printer. You can also take or upload the PDF to a professional printing service.",
      },
      {
        question: "Can I export the cookbook as a PDF?",
        answer:
          "Yes. Purchasing the cookbook unlocks PDF export for that cookbook. A free RecipePrinter account is required at download time so the purchase can be confirmed and kept with your cookbook.",
      },
      {
        question: "Can I edit the cookbook after I make it?",
        answer:
          "Yes. The purchase belongs to that cookbook, so you can continue editing it and export updated versions later without purchasing the same cookbook again.",
      },
      {
        question: "How much does it cost?",
        answer:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. Printing and binding from an outside printing service cost extra.",
      },
      {
        question: "Does RecipePrinter print and ship my cookbook?",
        answer:
          "No. RecipePrinter creates the finished cookbook PDF. You can print it yourself or send the file to a professional printing service.",
      },
      {
        question: "Can I make a family cookbook from handwritten recipes?",
        answer:
          "Yes. Photograph or scan handwritten recipe cards, review the recipe text, then add those recipes to the cookbook alongside recipes from other sources.",
      },
    ],
    links: [
      { href: "/cookbook-maker", label: "Use the online cookbook maker" },
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/homemade-cookbook-gift", label: "Make a cookbook gift" },
      { href: "/createmycookbook-alternative", label: "CreateMyCookbook alternative" },
      { href: "/how-to-print-a-cookbook", label: "How to print a cookbook" },
    ],
  },
  {
    slug: "cookbook-maker",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "cookbook maker",
    secondaryKeywords: [
      "online cookbook maker",
      "recipe book creator",
      "recipe book maker",
      "create a cookbook online",
      "make a cookbook from my recipes",
      "cookbook creator",
      "custom cookbook maker",
      "family cookbook maker",
    ],
    shortLabel: "Cookbook maker",
    pickerGroup: "output",
    intent: "Organization SEO",
    layout: "capture-first",
    heroImage: "bound-cookbook",
    initialImportMode: "url",
    importModes: ["url", "apps", "image", "text"],
    importSubmitLabel: "Open the cookbook maker",
    title: "Cookbook Maker for Your Own Recipes | RecipePrinter",
    description:
      "Create a cookbook from your own recipes. Import recipes, organize chapters, edit pages, add a cover and table of contents, then export a print-ready PDF.",
    h1: "Make a cookbook from your own recipes",
    lede:
      "Use the RecipePrinter cookbook maker to import your own recipes, organize them into chapters, edit the pages, customize the cover, and export a finished print-ready PDF.",
    howToHeading: "How the cookbook maker works",
    howTo: [
      {
        name: "Import your recipes",
        text: "Add recipe links, photos, screenshots, handwritten cards, pasted text, or recipes from supported apps. RecipePrinter turns them into editable recipes so you do not have to retype everything by hand.",
      },
      {
        name: "Build chapters",
        text: "Create and rename cookbook chapters, reorder them, and move recipes between sections as your book takes shape.",
      },
      {
        name: "Edit every recipe and page",
        text: "Correct recipe text, add notes or photos, rearrange recipes, and customize the book while you work. The table of contents and page numbers update with the current structure.",
      },
      {
        name: "Export a print-ready cookbook PDF",
        text: "Export a PDF for printing at home or with a professional printer. RecipePrinter creates the finished file but does not physically print or ship the book.",
      },
    ],
    featureSections: [
      {
        heading: "Make a cookbook from recipes you already have",
        image: "inline-editing",
        imageAlt: "A recipe being edited inside the RecipePrinter cookbook maker.",
        body:
          "You do not need to start with a finished manuscript. Import recipes one at a time from websites, photos, handwritten cards, screenshots, apps, or pasted text, then edit them as you build the cookbook.",
        afterBody:
          "That makes it easy to combine recipes that currently live in completely different places into one consistent book.",
      },
      {
        heading: "Organize recipes into cookbook chapters",
        image: "bound-cookbook",
        imageAlt: "A finished cookbook open to a full-page photograph and a formatted recipe page.",
        body:
          "Create chapters, move recipes between sections, and see how the cookbook is organized while you work. The cover, opening pages, recipe pages, table of contents, and page numbers stay part of the same cookbook.",
        afterBody:
          "Chapter opener pages can also include custom images and optional text.",
      },
      {
        heading: "Customize the cover, table of contents, and page numbers",
        body:
          "Give the cookbook a finished structure with a custom cover, chapter sections, a table of contents, and page numbers. You can keep editing the book as recipes move or chapters change.",
        afterBody:
          "Choose a cover design and image that fits the cookbook.",
      },
      {
        heading: "$19.99 for one editable cookbook",
        image: "printed-cookbook",
        imageAlt: "A finished spiral-bound cookbook open to a formatted recipe and food photograph.",
        body:
          "Cookbook export costs $19.99 per cookbook. That one-time purchase lets you keep editing that cookbook and export updated PDFs again later.",
        afterBody:
          "RecipePrinter creates the PDF; you can print it at home or send the finished file to a printing service of your choice. A free RecipePrinter account is required to download the cookbook.",
      },
    ],
    faqHeading: "Cookbook maker questions",
    faqs: [
      {
        question: "What can I import into the cookbook maker?",
        answer:
          "You can import recipes from websites, photos, screenshots, handwritten recipe cards, pasted text, supported recipe apps, and other RecipePrinter imports. Review each recipe before adding it to the cookbook.",
      },
      {
        question: "Can I organize recipes into chapters?",
        answer:
          "Yes. Add and rename chapters, reorder them, and move recipes between sections as the cookbook changes.",
      },
      {
        question: "Does it create a table of contents and page numbers?",
        answer:
          "Yes. RecipePrinter builds the table of contents and page numbers from the cookbook's current recipe and chapter order.",
      },
      {
        question: "Can I customize the cookbook cover?",
        answer:
          "Yes. You can edit the cover title and choose its design and image. Cover options depend on the current cookbook templates.",
      },
      {
        question: "Does RecipePrinter print and ship the book?",
        answer:
          "No. RecipePrinter creates the cookbook PDF. You can print it at home or upload the finished file to a professional printing service of your choice.",
      },
      {
        question: "Do I need RecipePrinter Pro?",
        answer:
          "No. Cookbook purchases and RecipePrinter Pro are separate. Pro covers other RecipePrinter features and does not include cookbook export.",
      },
      {
        question: "How much does the cookbook maker cost?",
        answer:
          "Cookbook export is $19.99 per cookbook. The purchase lets you keep editing that cookbook and export updated PDFs again later.",
      },
      {
        question: "Can I edit my cookbook after I buy it?",
        answer:
          "Yes. After purchasing a cookbook, you can continue editing that cookbook and export updated versions later.",
      },
    ],
    links: [
      { href: "/make-your-own-cookbook", label: "Learn how to make your own cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/organize-recipes", label: "Organize recipes" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/createmycookbook-alternative", label: "CreateMyCookbook alternative" },
      { href: "/how-to-print-a-cookbook", label: "How to print a cookbook" },
    ],
  },
  {
    slug: "how-to-print-a-cookbook",
    contentUpdated: "2026-10-05",
    primaryKeyword: "how to print a cookbook",
    // Facts about each destination come from lib/printDestinations.ts and
    // lib/cookbookPresets.ts (what the export dialog builds) and are phrased
    // from RecipePrinter's side. No bleed or spine numbers, and no printer
    // prices: those are the printers' to set and would go stale here.
    secondaryKeywords: [
      "print your own cookbook",
      "cookbook printing",
      "print a recipe book",
      "print cookbook PDF",
      "cookbook printing at home",
    ],
    shortLabel: "A printed cookbook",
    pickerGroup: "output",
    intent: "Organization SEO",
    layout: "guide-first",
    heroImage: "bound-cookbook",
    initialImportMode: "url",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Start your cookbook",
    captureHeading: "Start your cookbook",
    title: "How to Print a Cookbook | At Home, Copy Shop, Lulu or Blurb",
    description:
      "Learn how to print your cookbook at home, at a copy shop, or with an online book printer like Lulu or Blurb. Export the print-ready files from RecipePrinter.",
    h1: "How to print a cookbook",
    anchor: "How to print a cookbook",
    lede:
      "Once your cookbook is finished, you can print it at home, take the PDF to a copy shop, or upload it to an online book printer like Lulu or Blurb. RecipePrinter gives you the files for each option; it doesn't print or ship books itself.",
    howToHeading: "From finished cookbook to printed book",
    howTo: [
      {
        name: "Finish the cookbook",
        text: "Build the book in RecipePrinter: organize recipes into chapters, add a cover, and review everything before exporting. The table of contents is built for you.",
      },
      {
        name: "Choose where it will be printed",
        text: "Print it yourself, take the file to a copy shop, or use an online book printer such as Lulu or Blurb. The right choice depends on the binding and finish you want.",
      },
      {
        name: "Download the files",
        text: "RecipePrinter prepares a print-ready PDF for the option you choose. Home and copy-shop printing use one file; Lulu and Blurb also take a separate cover file.",
      },
      {
        name: "Print, or upload and order",
        text: "Print the PDF at home, send it to a local printer, or upload the files to the printing service and order your copies.",
      },
    ],
    featureSections: [
      {
        heading: "On your own printer",
        image: "convert-to-pdf",
        body:
          "Printing at home is the simplest way to print your own cookbook as a binder or loose pages. RecipePrinter exports one US Letter PDF, with the cover as its first page.",
        afterBody:
          "Put the pages in a three-ring binder or sheet protectors, or take the stack to a copy shop later if you decide you want it bound.",
      },
      {
        heading: "At a copy shop",
        image: "printed-cookbook",
        body:
          "A copy shop can print the same US Letter PDF and bind it for you. It's an easy way to get a spiral or coil-bound cookbook that lies flat on the counter.",
        afterBody:
          "At a copy shop such as Staples, upload the PDF through the shop's website or bring the file in, then choose the paper and binding. Copy shops bind documents, so ask about the bindings yours offers; hardcovers come from a book printer.",
      },
      {
        heading: "With Lulu",
        body:
          "Lulu prints books to order, including coil-bound and hardcover cookbooks. Choose Lulu when you export, and RecipePrinter sizes the pages for the Lulu format you pick.",
        afterBody: [
          "Lulu takes the cover as its own file. Upload the pages to Lulu first, copy the cover dimensions and spine width it shows you into RecipePrinter, and download a cover made to those numbers. Then finish the order with Lulu, which prints and ships it.",
        ],
      },
      {
        heading: "With Blurb",
        body:
          "Blurb is another printer for professionally made books. RecipePrinter can prepare an 8 × 10 hardcover export for Blurb's PDF upload.",
        afterBody:
          "The cover is a separate file so it can match the dimensions Blurb gives you for that specific book. Enter them in RecipePrinter, download the cover, and finish the order with Blurb.",
      },
    ],
    faqHeading: "Cookbook printing questions",
    faqs: [
      {
        question: "Where should I print my cookbook?",
        answer:
          "Print at home if you want the simplest way to print a recipe book, or plan to use a binder. Use a copy shop for an easy spiral or coil-bound book. Use an online book printer such as Lulu or Blurb for a hardcover or a professionally made book to give as a gift.",
      },
      {
        question: "What size will the cookbook be?",
        answer:
          "It depends on the printing option you choose at export. Home, copy-shop, and Lulu books are US Letter (8.5 × 11 inches), in coil or hardcover with Lulu. The Blurb hardcover is 8 × 10 inches.",
      },
      {
        question: "Why is the cover a separate file for Lulu and Blurb?",
        answer:
          "A bound book's cover wraps around the front, the spine, and the back, and the spine's width depends on the number of pages. Book printers take the cover as its own file for that reason, and RecipePrinter makes it to the measurements the printer gives you.",
      },
      {
        question: "What does edge to edge mean for photos?",
        answer:
          "Edge to edge means a photo reaches all the way to the trimmed edge of the page instead of keeping a white border. Printers need the image to run slightly past the trim line so small cutting differences don't leave a white sliver. That extra image area is called bleed. Standard photos keep a border, so any printer can print all of them.",
      },
      {
        question: "Does RecipePrinter print and ship the book?",
        answer:
          "No. RecipePrinter builds the cookbook and gives you the files to print it. Print at home, or send the files to a copy shop or an online book printer, which handles the printing and delivery.",
      },
      {
        question: "How much does it cost?",
        answer: `There are two costs. Exporting the cookbook from RecipePrinter is ${COOKBOOK_PRICE_FALLBACK}, paid once per cookbook. Printing is separate and depends on where you print, the binding, page count, paper, and number of copies.`,
      },
      {
        question: "Can I print more copies later, or fix something first?",
        answer:
          "Yes. You can go back to the cookbook, make changes, and export it again, so you can fix a typo or add a recipe before ordering another copy. Keep the files to print more copies whenever you like.",
      },
    ],
    links: [
      { href: "/make-your-own-cookbook", label: "Make your own cookbook" },
      { href: "/cookbook-maker", label: "Cookbook maker" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/homemade-cookbook-gift", label: "Make a homemade cookbook gift" },
    ],
  },
  {
    slug: "handwritten-recipes-to-cookbook",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "turn handwritten recipes into a cookbook",
    secondaryKeywords: [
      "handwritten recipe cookbook",
      "family recipe cookbook",
      "digitize handwritten recipes for cookbook",
      "old recipe cards into cookbook",
      "make a cookbook from recipe cards",
      "preserve family recipes in a cookbook",
      "handwritten family recipe book",
      "recipe card cookbook",
      "family cookbook from handwritten recipes",
    ],
    shortLabel: "Handwritten recipe cookbook",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    layout: "capture-first",
    heroImage: "handwritten-card",
    heroImageAlt: "A handwritten family recipe card ready to be digitized.",
    initialImportMode: "image",
    importFieldLabel: "Handwritten recipe images",
    importUploadTitle: "Choose or drop photos",
    importPlaceholder:
      "Upload a photo or scan of a handwritten recipe card. Add the front and back together if the recipe continues onto both sides.",
    importSubmitLabel: "Start with this recipe",
    title: "Turn Handwritten Recipes Into a Cookbook | RecipePrinter",
    description:
      "Digitize handwritten recipe cards, clean up the recipe text, and turn family recipes into a cookbook you can edit, print, or export as a PDF.",
    h1: "Turn handwritten recipes into a cookbook",
    lede:
      "Photograph or scan handwritten recipe cards, review the editable recipe text, and bring recipes from different generations together in one family cookbook.",
    howToHeading: "How to turn handwritten recipes into a cookbook",
    howTo: [
      {
        name: "Photograph or scan the recipe cards",
        text: "Take a clear photo or scan of each handwritten recipe. Keep the card flat, use good lighting, and include both sides when the recipe continues onto the back.",
      },
      {
        name: "Review the recipe",
        text: "RecipePrinter turns the handwriting into editable ingredients and instructions. Review the result carefully and correct any words, amounts, or notes that were difficult to read.",
      },
      {
        name: "Bring the family recipes together",
        text: "Add recipes from different relatives, recipe boxes, websites, screenshots, or other sources. Give each recipe a consistent format while keeping names, notes, and family context where appropriate.",
      },
      {
        name: "Organize and export the cookbook",
        text: "Arrange recipes into chapters, customize the cover and pages, then export the finished cookbook as a PDF. Print it at home or send the file to a professional printer.",
      },
    ],
    featureSections: [
      {
        heading: "Preserve the original recipe card and make a clean copy",
        image: "inline-editing",
        imageAlt: "A handwritten recipe converted into editable recipe text in RecipePrinter.",
        body:
          "The original handwritten card is part of the family history, so you do not have to replace it. Keep the original safely stored while RecipePrinter creates an editable version you can correct, print, and cook from.",
        afterBody:
          "This is especially useful for faded measurements, hard-to-read handwriting, or cards that are becoming too fragile for everyday use.",
      },
      {
        heading: "Combine recipes from different generations",
        image: "card-in-box",
        imageAlt: "Family recipe cards stored behind dividers in a recipe box.",
        body:
          "A family cookbook can include recipes from grandparents, parents, siblings, cousins, or anyone else whose recipes belong in the collection. Organize them by person, meal, holiday, family branch, or recipe type.",
        afterBody:
          "Recipes do not have to come from handwritten cards only. You can mix handwritten family recipes with recipes from websites, screenshots, photos, or pasted text.",
      },
      {
        heading: "Keep the handwriting without cooking from the fragile original",
        image: "handwritten-card",
        imageAlt: "An original handwritten recipe card preserved beside its floral recipe box.",
        body:
          "For recipes with meaningful handwriting, notes, stains, or corrections, keep a photo of the original card with the recipe when appropriate. That way the cookbook can preserve the look and history of the recipe while still giving you readable ingredients and instructions.",
      },
      {
        heading: "Keep updating the family cookbook over time",
        image: "bound-cookbook",
        imageAlt: "A finished family cookbook made from collected recipes.",
        body:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. After purchasing that cookbook, you can keep editing it, add newly found recipes, correct transcriptions, rearrange chapters, and export updated PDFs later.",
      },
    ],
    faqHeading: "Handwritten recipe cookbook questions",
    faqs: [
      {
        question: "Can RecipePrinter read cursive handwriting?",
        answer:
          "Yes. RecipePrinter can read many handwritten and cursive recipe cards, but handwriting recognition is not perfect. Review the ingredients and instructions and correct anything that was difficult to read.",
      },
      {
        question: "Should I scan the cards or photograph them?",
        answer:
          "Either works. A scanner can capture fine detail, while a clear phone photo is usually faster. Keep the card flat, avoid shadows, and make sure the writing is easy to see.",
      },
      {
        question: "Can I preserve the original handwritten recipe card?",
        answer:
          "Yes. Keep the original card safely stored and use the cleaned RecipePrinter version for everyday cooking. You can also keep the original photo as part of your family archive and, when appropriate, use it as recipe imagery in the cookbook.",
      },
      {
        question: "Can I combine handwritten recipes with online recipes?",
        answer:
          "Yes. A cookbook can include handwritten recipe cards alongside recipes imported from websites, screenshots, photos, pasted text, and supported recipe apps.",
      },
      {
        question: "How do I make a cookbook from handwritten recipe cards?",
        answer:
          "Digitize and review each recipe, add the finished recipes to a cookbook, organize them into chapters, customize the cover and pages, then export the completed cookbook as a PDF.",
      },
      {
        question: "How much does it cost to make the cookbook?",
        answer:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase.",
      },
      {
        question: "Can I keep editing the cookbook after I buy it?",
        answer:
          "Yes. The purchase belongs to that cookbook, so you can continue editing it and export updated versions later.",
      },
      {
        question: "Does RecipePrinter print and ship the cookbook?",
        answer:
          "No. RecipePrinter creates the finished cookbook PDF. You can print it at home or send the file to a professional printing service.",
      },
    ],
    links: [
      { href: "/digitize-recipe-cards", label: "Digitize recipe cards" },
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/make-your-own-cookbook", label: "Make your own cookbook" },
      { href: "/bridal-shower-recipe-book", label: "Bridal shower recipe book" },
    ],
  },
  {
    slug: "homemade-cookbook-gift",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "homemade cookbook gift",
    secondaryKeywords: [
      "DIY cookbook gift",
      "personalized cookbook gift",
      "make a cookbook as a gift",
      "recipe book gift",
    ],
    shortLabel: "A cookbook gift",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    layout: "capture-first",
    heroImage: "bound-cookbook",
    initialImportMode: "url",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Start the gift cookbook",
    title: "Homemade Cookbook Gift | Make a Personalized Recipe Book",
    description:
      "Turn family recipes, handwritten cards, and favorite dishes into a personalized cookbook gift you can edit, print at home, or export as a PDF.",
    h1: "Make a homemade cookbook as a gift",
    lede:
      "Collect family recipes, handwritten cards, and favorite dishes, then turn them into a personalized cookbook gift you can edit, print at home, or send to a professional printer.",
    howToHeading: "How to make a personalized cookbook gift",
    howTo: [
      {
        name: "Choose who the cookbook is for",
        text: "Build the cookbook around the person receiving it. Start with recipes they make often, family favorites, dishes they grew up with, or recipes connected to people and memories that matter to them.",
      },
      {
        name: "Collect recipes from family and friends",
        text: "Gather handwritten cards, recipe links, screenshots, photos, pasted text, or recipes from supported apps. RecipePrinter turns the different sources into editable recipes you can review and organize.",
      },
      {
        name: "Personalize the cookbook",
        text: "Add chapters, a cover image, dedication, notes, and photos where supported. Review names, measurements, and hard-to-read handwriting before the cookbook is finished.",
      },
      {
        name: "Print or export the finished gift",
        text: "Download the finished PDF and print it at home or send it to a professional printer for binding. RecipePrinter creates the file but does not manufacture or ship the physical cookbook.",
      },
    ],
    featureSections: [
      {
        heading: "Make a cookbook gift from family recipes",
        image: "handwritten-card",
        body:
          "The most personal cookbook gifts are built from recipes that already mean something: a parent's favorite dinner, a grandparent's handwritten recipe, or the dish everyone asks for at holidays. Bringing those recipes together turns the gift into something useful as well as personal.",
      },
      {
        heading: "Combine handwritten recipes and online favorites",
        image: "inline-editing",
        body:
          "Recipes do not need to begin in the same format. Photograph an index card, paste a recipe link, upload a screenshot, or add recipe text manually. RecipePrinter turns those different sources into editable recipes so the finished cookbook feels consistent.",
        afterBody:
          "Review difficult handwriting and imported measurements before adding each recipe to the book.",
      },
      {
        heading: "Ideas for making the cookbook feel personal",
        image: "cookbook-cover",
        body:
          "Organize chapters around the person receiving the gift instead of following a traditional cookbook. You might group recipes by family member, holidays, childhood favorites, weeknight dinners, or desserts everyone requests.",
        afterBody:
          "A dedication, family notes, photos, and recipe names can make the book feel more personal without turning it into a scrapbook.",
      },
      {
        // Not `bound-cookbook`: the hero already shows that photo.
        heading: "Keep editing the cookbook until the gift is finished",
        image: "printed-cookbook",
        body:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. After purchasing that cookbook, you can keep editing it, add newly found recipes, correct mistakes, rearrange chapters, and export updated PDFs later.",
      },
    ],
    faqHeading: "Homemade cookbook gift questions",
    faqs: [
      {
        question: "What recipes should go in a cookbook gift?",
        answer:
          "Choose recipes connected to the person receiving it: dishes they request, family favorites, meals tied to holidays or traditions, and recipes from people they care about. A smaller focused collection can feel more personal than a large generic cookbook.",
      },
      {
        question: "Can I use handwritten recipe cards?",
        answer:
          "Yes. Photograph or scan handwritten recipe cards, then review the ingredients and instructions RecipePrinter reads from them. Difficult handwriting may need correction before the recipe is added to the cookbook.",
        links: [
          { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
        ],
      },
      {
        question: "Can I add a cover and dedication?",
        answer:
          "Yes. Cookbooks can include a customizable cover and opening dedication, along with chapter pages and recipe notes where supported.",
      },
      {
        question: "Can I print the cookbook gift myself?",
        answer:
          "Yes. Download the finished PDF and print it at home, or send the file to a professional printing service for binding. RecipePrinter does not physically print or ship the book.",
      },
      {
        question: "Can I keep editing before I give it?",
        answer:
          "Yes. Keep adding and revising recipes while you work. After the cookbook is purchased, you can continue editing that cookbook and export updated versions later.",
      },
      {
        question: "How much does a homemade cookbook cost?",
        answer:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. Outside printing or binding costs are not included.",
      },
      {
        question: "Can I make the cookbook as a Christmas or holiday gift?",
        answer:
          "Yes. The finished cookbook is exported as a PDF, so you can print it at home or send it to a printer whenever you are ready.",
        links: [{ href: "/christmas-recipe-book", label: "Christmas recipe book ideas" }],
      },
      {
        question: "Can I make a cookbook gift for Mom or Grandma?",
        answer:
          "Yes. Family recipes, handwritten cards, and favorite dishes can all be combined into a cookbook built around one person or one side of the family.",
        links: [{ href: "/family-recipe-book", label: "Create a family recipe book" }],
      },
    ],
    links: [
      { href: "/christmas-recipe-book", label: "Make a family recipe book for Christmas" },
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/make-your-own-cookbook", label: "Make your own cookbook" },
      { href: "/recipe-book-gift", label: "More recipe book gift ideas" },
      { href: "/bridal-shower-recipe-book", label: "Bridal shower recipe book" },
    ],
  },
  {
    slug: "recipe-book-gift",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "recipe book gift",
    secondaryKeywords: [
      "personalized recipe book gift",
      "cookbook gift",
      "personalized cookbook gift",
      "family recipe book gift",
      "custom recipe book gift",
    ],
    shortLabel: "A recipe book gift",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    layout: "capture-first",
    heroImage: "cookbook-cover",
    heroImageAlt:
      "A printed recipe book cover titled Our Family Cookbook, made as a personalized gift.",
    initialImportMode: "url",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Start the recipe book",
    title: "Personalized Recipe Book Gift | RecipePrinter",
    description:
      "Create a personalized recipe book gift from family recipes, handwritten cards, photos, and favorites, then print it at home or export a finished PDF.",
    h1: "Make a personalized recipe book gift",
    anchor: "Personalized recipe book gift",
    lede:
      "Build a recipe book around one person and the food that matters to them. Combine family recipes, handwritten cards, photos, and favorites into a personalized cookbook you can print or export as a PDF.",
    howToHeading: "How to give a personalized recipe book",
    howTo: [
      {
        name: "Choose who the recipe book is for",
        text: "Start with the person receiving the gift. Think about the dishes they make, recipes they grew up with, family favorites, and foods connected to people or memories that matter to them.",
      },
      {
        name: "Collect recipes from family and friends",
        text: "Gather handwritten cards, recipe links, screenshots, photos, or typed recipes from one person or several contributors. RecipePrinter turns the different sources into editable recipes you can review.",
      },
      {
        name: "Personalize the recipe book",
        text: "Organize recipes into chapters, add a cover and dedication, and include photos or notes where supported. Every recipe stays editable while you build the book.",
      },
      {
        name: "Print it or send it to a printer",
        text: "Export the finished recipe book as a PDF and print it at home or send it to a professional printer. RecipePrinter creates the file but does not physically print or ship the book.",
      },
    ],
    featureSections: [
      {
        heading: "Recipe book gift ideas for different occasions",
        image: "bound-cookbook",
        body:
          "A personalized recipe book can work as a wedding gift, birthday gift, Mother's Day gift, anniversary gift, housewarming gift, or holiday present. The occasion matters less than choosing recipes that feel connected to the person receiving it.",
        afterBody:
          "The strongest recipe book gifts are usually specific: family recipes, favorite meals, recipes from someone they love, or dishes tied to traditions they want to keep.",
      },
      {
        heading: "Give a recipe book or a box of recipe cards",
        image: "card-in-box",
        body:
          "A cookbook is useful when you want a cover, chapters, and a finished collection. A recipe box can work better for a smaller set of favorite recipes that someone can keep adding to over time.",
        afterBody:
          "Cookbook export costs $19.99 per cookbook. 4x6 recipe cards are available with RecipePrinter Pro.",
      },
      {
        heading: "Let family and friends contribute recipes",
        image: "handwritten-card",
        body:
          "Ask contributors to send whatever they already have: a photo of a handwritten card, a recipe link, screenshot, scan, or typed recipe. You can import each one into RecipePrinter, review the ingredients and instructions, and add the finished recipe to the book.",
        afterBody:
          "This makes it easier to create a group gift without asking everyone to rewrite their recipes in the same format.",
      },
      {
        heading: "Keep updating the recipe book after you give it",
        image: "printed-cookbook",
        body:
          "After purchasing a cookbook, you can keep editing that cookbook and export updated PDFs later. Add recipes that arrive late, correct mistakes, or make a new version without purchasing the same cookbook again.",
      },
      {
        // Text only: no existing photo shows the people this is about, and
        // the page already carries five.
        heading: "Who makes a good recipe book gift for?",
        body:
          "A personalized recipe book can work for parents, grandparents, newlyweds, adult children, siblings, friends, or anyone who has recipes worth collecting in one place.",
        afterBody:
          "The book can focus on one person's recipes, one side of a family, a couple starting a household, or a group of relatives contributing together.",
      },
    ],
    faqHeading: "Recipe book gift questions",
    faqs: [
      {
        question: "What makes a good recipe book gift?",
        answer:
          "A good recipe book gift is built around the person receiving it. Include recipes they make often, dishes connected to family or traditions, and recipes from people they care about rather than filling the book with generic recipes.",
      },
      {
        question: "Who is a personalized recipe book a good gift for?",
        answer:
          "Recipe books can make meaningful gifts for parents, grandparents, newlyweds, siblings, friends, or anyone with family recipes or favorite dishes they want to keep.",
      },
      {
        question: "Can several people contribute recipes?",
        answer:
          "Yes. Contributors can send recipe links, screenshots, photos, scans of handwritten cards, or typed recipes. You can import each recipe, review it, and add it to the same cookbook.",
        links: [{ href: "/family-recipe-book", label: "Create a family recipe book" }],
      },
      {
        question: "Can I give recipe cards instead of a book?",
        answer:
          "Yes. Recipe cards can be a good choice for a smaller collection or a recipe box someone can keep adding to. 4x6 recipe cards are available with RecipePrinter Pro.",
        links: [{ href: "/recipe-card-printer", label: "Make printable recipe cards" }],
      },
      {
        question: "Does RecipePrinter print and ship the recipe book?",
        answer:
          "No. RecipePrinter creates the finished cookbook PDF. You can print it at home or send the file to a professional printing service.",
        links: [{ href: "/how-to-print-a-cookbook", label: "How to print a cookbook" }],
      },
      {
        question: "How much does a recipe book gift cost?",
        answer:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. Any outside printing or binding costs are additional.",
      },
      {
        question: "Can I make a recipe book from family recipes?",
        answer:
          "Yes. Handwritten recipe cards, recipe links, screenshots, photos, pasted text, and supported recipe imports can all be combined into the same cookbook.",
        links: [
          { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
        ],
      },
      {
        question: "Can I make one for Christmas?",
        answer:
          "Yes. RecipePrinter creates the finished PDF, so there is no RecipePrinter shipping cutoff. If you use an outside printer, check that company's current holiday production schedule.",
        links: [{ href: "/christmas-recipe-book", label: "Make a family recipe book for Christmas" }],
      },
      {
        question: "Can I keep editing the recipe book after I give it?",
        answer:
          "Yes. Once that cookbook is purchased, you can continue editing it and export updated versions later.",
      },
    ],
    links: [
      { href: "/homemade-cookbook-gift", label: "Make a homemade cookbook gift" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
      { href: "/make-your-own-cookbook", label: "Make your own cookbook" },
      { href: "/bridal-shower-recipe-book", label: "Bridal shower recipe book" },
    ],
  },
  {
    slug: "christmas-recipe-book",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-10-02",
    primaryKeyword: "Christmas recipe book",
    secondaryKeywords: [
      "Christmas cookbook gift",
      "family recipe book Christmas gift",
      "cookbook Christmas gift",
      "recipe book for Christmas",
    ],
    shortLabel: "A Christmas recipe book",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    layout: "capture-first",
    heroImage: "bound-cookbook",
    initialImportMode: "image",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Start the Christmas recipe book",
    title: "Make a Family Recipe Book for Christmas | RecipePrinter",
    description:
      "Turn family recipes and handwritten cards into a personalized Christmas recipe book you can edit, print at home, or export as a PDF.",
    h1: "Make a family recipe book for Christmas",
    lede:
      "Gather family recipes, handwritten cards, and holiday favorites into a personalized Christmas recipe book you can edit, print at home, or send to a professional printer.",
    howToHeading: "How to make a family recipe book for Christmas",
    howTo: [
      {
        name: "Choose the family recipes to include",
        text: "Start with the dishes your family makes every year, then add everyday favorites, inherited recipes, and recipes connected to people or traditions that matter.",
      },
      {
        name: "Collect recipes from family",
        text: "Ask relatives for handwritten cards, recipe photos, screenshots, links, or typed recipes. Import each one into RecipePrinter and review the text before adding it to the book.",
      },
      {
        name: "Build the Christmas cookbook over time",
        text: "Organize recipes into chapters, add a cover and dedication, and keep adding recipes as family members send them in. Page numbers and the table of contents can update as the book changes.",
      },
      {
        name: "Print or export the finished Christmas gift",
        text: "Download the finished PDF and print it at home or send it to a professional printer. RecipePrinter creates the file but does not physically print or ship the book.",
      },
    ],
    featureSections: [
      {
        heading: "Collect family recipes before Christmas",
        image: "handwritten-card",
        body:
          "Old recipe cards often raise questions: a missing oven temperature, a shorthand note, or an ingredient amount only one relative remembers. Starting early gives you time to ask family members for missing details and review difficult handwriting before the cookbook is finished.",
        afterBody:
          "You can also keep adding recipes as relatives send them in instead of waiting until you have the whole collection at once.",
      },
      {
        heading: "Make the Christmas recipe book feel personal",
        image: "card-in-box",
        body:
          "Organize the book around your own family instead of using a generic cookbook structure. Group recipes by holiday, family member, meal, tradition, or any categories that make sense for the person receiving the gift.",
        afterBody:
          "Use a custom cover, dedication, family notes, photos, and recipe names where supported to make the book feel like it belongs to your family.",
      },
      {
        // Not `bound-cookbook`: the hero already shows that photo.
        heading: "Finish the cookbook without waiting for RecipePrinter shipping",
        image: "printed-cookbook",
        body:
          "RecipePrinter creates the finished cookbook PDF instead of manufacturing or shipping a physical book. That means there is no RecipePrinter production queue or shipping cutoff.",
        afterBody: [
          "You can print the PDF at home or send it to a professional printing service. If you plan to use an outside printer, check that company's current holiday production and delivery schedule.",
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. After purchasing that cookbook, you can keep editing it and export updated PDFs later.",
        ],
      },
      {
        heading: "What to put in a Christmas family recipe book",
        image: "cookbook-cover",
        body:
          "Include the recipes people expect at Christmas, but do not limit the book to holiday food. Everyday family favorites, handwritten recipes from relatives, birthday dishes, baking recipes, and meals connected to family memories can make the gift more useful all year.",
        afterBody:
          "A smaller collection of meaningful recipes can feel more personal than trying to fill the book with every recipe the family has ever made.",
      },
    ],
    faqHeading: "Christmas recipe book questions",
    faqs: [
      {
        question: "When should I start a family recipe book for Christmas?",
        answer:
          "Start as soon as you can, especially if several relatives are contributing or old recipe cards need interpretation. RecipePrinter has no manufacturing deadline, but a professional printer may have its own holiday production and shipping schedule.",
      },
      {
        question: "Can relatives send me photos of their recipes?",
        answer:
          "Yes. Family members can send photos or scans of recipe cards, screenshots, links, or typed recipe text. You can import and review those recipes before adding them to the cookbook.",
      },
      {
        question: "Can I include handwritten family recipes?",
        answer:
          "Yes. Photograph or scan handwritten recipe cards and review the ingredients and instructions before adding them to the cookbook. Difficult handwriting may need correction.",
        links: [
          { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
        ],
      },
      {
        question: "Does RecipePrinter ship the finished cookbook?",
        answer:
          "No. RecipePrinter creates the finished cookbook PDF. You can print it at home or send the file to a professional printing service for binding or hardcover printing.",
        links: [{ href: "/how-to-print-a-cookbook", label: "How to print a cookbook" }],
      },
      {
        question: "Can I update the book after Christmas?",
        answer:
          "Yes. The cookbook purchase stays with that cookbook, so you can keep editing it, add newly found family recipes, and export updated PDFs later.",
      },
      {
        question: "How much does a Christmas recipe book cost?",
        answer:
          "Cookbook export costs $19.99 per cookbook as a one-time purchase. Any outside printing or binding costs are additional.",
      },
      {
        question: "Can I make more than one copy as Christmas gifts?",
        answer:
          "Yes. Once you have the finished cookbook PDF, you can print as many physical copies as you want yourself or through a printing service.",
      },
      {
        question: "Can I make the recipe book now and keep editing it later?",
        answer:
          "Yes. After purchasing that cookbook, you can continue editing it and export updated versions later without buying the same cookbook again.",
        links: [{ href: "/homemade-cookbook-gift", label: "Cookbook gift ideas for any time of year" }],
      },
    ],
    links: [
      { href: "/homemade-cookbook-gift", label: "Make a homemade cookbook gift" },
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/make-your-own-cookbook", label: "Make your own cookbook" },
      { href: "/recipe-book-gift", label: "More recipe book gift ideas" },
    ],
  },
  {
    slug: "bridal-shower-recipe-book",
    contentUpdated: "2026-10-05",
    primaryKeyword: "bridal shower recipe book",
    // Not "turn handwritten recipes into a cookbook": that is
    // /handwritten-recipes-to-cookbook's primary, linked from here instead.
    secondaryKeywords: [
      "bridal shower recipe cards",
      "recipe card bridal shower",
      "recipe shower",
      "wedding recipe book",
      "recipe book gift for bride",
    ],
    shortLabel: "A bridal shower recipe book",
    pickerGroup: "output",
    intent: "Preservation and Gift SEO",
    layout: "capture-first",
    heroImage: "handwritten-card",
    heroImageAlt:
      "A handwritten recipe card in cursive beside an open recipe box, the kind of card guests fill in at a bridal shower.",
    initialImportMode: "image",
    importModes: ["image", "url", "text"],
    importSubmitLabel: "Start the recipe book",
    // Several photos in one upload are read as ONE recipe (ImportPanel's
    // "drop multiple for one recipe"), so a host with a stack of cards has to
    // be told to do them one at a time.
    importHint:
      "Upload one card at a time. Photos uploaded together are read as one recipe, like the front and back of a card.",
    title: "Bridal Shower Recipe Book | Turn Recipe Cards Into a Cookbook",
    description:
      "Collect recipe cards from bridal shower guests, turn handwritten recipes into editable text, and create a finished recipe book for the couple.",
    h1: "Turn bridal shower recipe cards into a recipe book",
    anchor: "Bridal shower recipe book",
    lede:
      "Ask each guest to bring a favorite recipe to the bridal shower. Afterward, photograph the cards and turn them into a finished recipe book for the couple to keep.",
    howToHeading: "How to make a bridal shower recipe book",
    howTo: [
      {
        name: "Collect a recipe from every guest",
        text: "Ask guests to bring a favorite recipe on a card, printed sheet, or handwritten note. You can also have blank recipe cards ready at the shower.",
      },
      {
        name: "Photograph the cards",
        text: "Take a clear photo or scan of each recipe after the shower. RecipePrinter reads the handwriting and turns each card into ingredients and instructions you can review.",
      },
      {
        name: "Build the book",
        text: "Add each recipe to the cookbook, organize them into chapters, and make any edits you need. Add a cover with the couple's names, wedding date, or a short dedication.",
      },
      {
        name: "Print it and give it",
        text: "Export the finished cookbook as a PDF and print it at home or with the printer of your choice. You can keep editing the cookbook if more recipes come in later.",
      },
    ],
    featureSections: [
      {
        heading: "Handwriting becomes a typed recipe",
        image: "inline-editing",
        body:
          "Every guest writes differently. RecipePrinter can turn handwritten recipes into clean, editable text, so you don't have to retype every ingredient and step yourself.",
        afterBody:
          "Review anything that was hard to read and fix it on the page, with the original card beside you to check against.",
        links: [{ phrase: "handwritten recipes", href: "/handwritten-recipes-to-cookbook" }],
      },
      {
        heading: "A cookbook made for the two of them",
        image: "bound-cookbook",
        body:
          "Make the finished book feel like theirs. Add the couple's names and wedding date to the cover, include a note from the hosts, and organize recipes into chapters like breakfasts, dinners, desserts, or family favorites.",
        afterBody: [
          "If it fits the shower, give each side of the family its own section of the wedding recipe book.",
          `Cookbook export costs ${COOKBOOK_PRICE_FALLBACK} per cookbook. You can keep editing it after you buy it, so recipes that arrive late can still go in.`,
        ],
      },
      {
        heading: "Give the book, the cards, or both",
        image: "card-in-box",
        body:
          "The finished cookbook can be the main gift, while the original recipe cards stay with the couple for the kitchen.",
        afterBody: [
          "You can also print matching 4×6 recipe cards and give both: a cookbook for the shelf and cards for everyday cooking.",
          "4×6 recipe cards need RecipePrinter Pro.",
        ],
      },
    ],
    faqHeading: "Bridal shower recipe book questions",
    faqs: [
      {
        question: "How do I collect recipes from guests?",
        answer:
          "Ask guests to bring a favorite recipe on a recipe card, printed sheet, or handwritten note. You can also include a blank recipe card with the invitation or set cards out at the shower. Guests who can't come can send a photo, a link, or the recipe typed in a message.",
      },
      {
        question: "Can I make the book after the shower is over?",
        answer:
          "Yes. Collect the recipe cards at the shower, photograph them afterward, and build the cookbook whenever you're ready. You can also add recipes later if someone sends theirs after the shower.",
      },
      {
        question: "What if I can't read a guest's handwriting?",
        answer:
          "RecipePrinter can read many handwritten recipes and turn them into editable text, but handwriting recognition isn't perfect. Review each recipe and correct anything that was hard to read before adding it to the book. For anything still unclear, ask the guest.",
        links: [
          { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
        ],
      },
      {
        question: "Does RecipePrinter print and ship the book?",
        answer:
          "No. RecipePrinter helps you build the cookbook and export the finished PDF. You can print it at home or send the PDF to the printing service of your choice.",
        links: [{ href: "/how-to-print-a-cookbook", label: "How to print a cookbook" }],
      },
      {
        question: "How much does it cost?",
        answer: `Importing recipes and building the cookbook are free. Exporting the finished cookbook costs ${COOKBOOK_PRICE_FALLBACK} per cookbook, paid once, and doesn't need RecipePrinter Pro. The free plan reads ${IMAGE_IMPORTS_PER_HOUR_FREE} photos an hour; Pro (${PRO_MONTHLY_PRICE_FALLBACK}) raises that to ${IMAGE_IMPORTS_PER_HOUR_PRO} and adds 4×6 recipe cards. Printing and binding are paid to your printer.`,
      },
      {
        question: "Can I give everyone at the shower a copy?",
        answer:
          "Yes. Once you've exported the cookbook PDF, you can print as many copies as you like to give to family and friends.",
      },
    ],
    links: [
      { href: "/recipe-book-gift", label: "Personalized recipe book gift" },
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
    ],
  },
  {
    slug: "just-the-recipe-alternative",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-02",
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
          "Just the Recipe keeps the cleaned-up recipe on a screen, with serving adjustments and printing on its Premium plan. RecipePrinter is built for the paper end of it: a full page for the binder, printed free without an account, or a recipe-box card and a batch of several at once with RecipePrinter Pro.",
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
          "Choose a full letter page or a 4 by 6 card sized for a recipe box, pick a theme, turn on cut lines for card stock, and print several recipes in one job. Full-page printing is free and works without an account; the card format and themes are RecipePrinter Pro, previewable free before you buy, and printing several at once is Pro too.",
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
            { feature: "Printing a full-page recipe", us: "Free, no account", them: "Paid plan" },
            { feature: "Recipe card sizes and themes", us: "RecipePrinter Pro", them: false },
            { feature: "Cut lines for card stock", us: "RecipePrinter Pro", them: false },
            { feature: "Printing several recipes in one job", us: "RecipePrinter Pro", them: false },
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
    faqHeading: "Questions about RecipePrinter and Just the Recipe",
    faqs: [
      {
        question: "How do I choose between them?",
        answer:
          "By where the recipe ends up. If you cook from a screen, that's what Just the Recipe does. If it ends up on paper, in a card box or a binder, that is what RecipePrinter does.",
      },
      {
        question: "What does each one cost?",
        answer:
          "Just the Recipe is free to read recipes and to save up to 20; printing, unlimited saves and serving adjustments are on Premium. RecipePrinter is free to print full-page recipes, with no account and no limit. The recipe-card format — every theme, 4x6 cards, the card toolkit — is RecipePrinter Pro, $4.99 a month or $39.99 a year. Cookbooks are separate: $19.99 per book, paid once.",
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
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
    ],
  },
  {
    slug: "reciscan-alternative",
    contentUpdated: "2026-10-05",
    copyReviewed: "2026-09-02",
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
    initialImportMode: "image",
    importModes: ["url", "image", "text"],
    title: "ReciScan Alternative for Printing Recipes | RecipePrinter",
    description:
      "Looking for a ReciScan alternative? Turn recipe photos and handwritten cards into editable recipes you can review and print right away.",
    h1: "Like ReciScan, but it prints today",
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
            { feature: "A 4 by 6 card for a recipe box, with cut lines", us: "RecipePrinter Pro", them: false },
            { feature: "A full letter page for a binder", us: true, them: false },
            { feature: "Printing it yourself", us: "Free for full-page; Pro for cards", them: true },
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
    faqHeading: "Questions about RecipePrinter and ReciScan",
    faqs: [
      {
        question: "How do I choose between them?",
        answer:
          "By what you want at the end. If it's one bound cookbook of the whole collection, ReciScan prints and ships that. If it's recipes on paper you can cook from this week, in a box or a binder, that's RecipePrinter.",
      },
      {
        question: "What does each one cost?",
        answer:
          "ReciScan is free to use, with a $4.99 monthly subscription for covers and extras, and printed books starting at $18. RecipePrinter is free to print full-page recipes, with no account. The recipe-card format — every theme, 4x6 cards, and the card toolkit — is RecipePrinter Pro: $4.99 a month or $39.99 a year. A cookbook is separate: $19.99 for each one you build, paid once.",
      },
      {
        question: "Can RecipePrinter send me a printed cookbook?",
        answer:
          "Not directly. It builds the finished cookbook as a print-ready file: run it on a home printer, keep the PDF, or take it to a print shop to have bound. A copy shop works from the same file if you would rather not print it yourself.",
        links: [{ href: "/how-to-print-a-cookbook", label: "How to print a cookbook" }],
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
      { href: "/createmycookbook-alternative", label: "CreateMyCookbook alternative" },
    ],
  },
  {
    slug: "canva-recipe-card-alternative",
    contentUpdated: "2026-10-05",
    primaryKeyword: "Canva recipe card alternative",
    // Not "recipe card maker" / "printable recipe card generator" or
    // "cookbook maker": those are /recipe-card-printer's and /cookbook-maker's,
    // and this page links to both.
    secondaryKeywords: [
      "Canva alternative for recipe cards",
      "recipe card template alternative",
      "Canva recipe template alternative",
      "Canva cookbook alternative",
      "make recipe cards without Canva",
    ],
    shortLabel: "Canva",
    pickerGroup: "comparison",
    intent: "Utility SEO",
    heroImage: "multi-themes",
    initialImportMode: "url",
    importModes: ["url", "image", "text"],
    title: "Canva Alternative for Recipe Cards | RecipePrinter",
    description:
      "Looking for a Canva alternative for recipe cards? Paste a recipe link, upload a photo, or add the text, and RecipePrinter turns it into a printable recipe card.",
    h1: "A Canva alternative for recipe cards",
    anchor: "Canva alternative for recipe cards",
    lede:
      "Canva gives you a blank design and lets you build the recipe card yourself. RecipePrinter starts with the recipe. Paste a link, upload a photo, or add the text, and it turns the recipe into a card that's ready to review and print.",
    featureSections: [
      {
        heading: "No typing, no copying box by box",
        image: "steps",
        body:
          "In a design tool, a recipe card is a layout you fill in yourself: the title in one box, the ingredients in another, the instructions somewhere else.",
        afterBody:
          "RecipePrinter is a recipe card maker that starts with the recipe instead. Paste a website link, upload a photo of a handwritten card, or paste the text, and it becomes an editable recipe you can print.",
        links: [{ phrase: "recipe card maker", href: "/recipe-card-printer" }],
      },
      {
        heading: "Long recipes fit without fiddling",
        image: "show-photo",
        body:
          "Some recipes don't fit on one side of a 4×6 card. Instead of shrinking the type or rearranging everything by hand, RecipePrinter continues the recipe onto the back of the card.",
        afterBody:
          "Two-sided printing is on by default. Set your printer to flip on the long edge and the front and back line up.",
      },
      {
        heading: "Where Canva is the better choice",
        image: "card",
        body:
          "If you want full control over every element, Canva is the better tool. You can design from a blank canvas, move elements anywhere, use a huge template library, and make something that doesn't need to behave like a recipe.",
        afterBody:
          "RecipePrinter is narrower on purpose. It's built for recipes, so you give up some design freedom in exchange for less setup.",
      },
    ],
    comparison: {
      competitor: "Canva",
      checked: "October 2026",
      groups: [
        {
          title: "Getting recipes in",
          rows: [
            { feature: "From a recipe link", us: "Reads the recipe for you", them: "You add the recipe yourself" },
            { feature: "From a photo of a handwritten card", us: "Reads it into editable text", them: "You place the photo or the text in your layout" },
            { feature: "From text you paste in", us: "Formats the recipe for you", them: "Paste it into your layout" },
          ],
        },
        {
          title: "Designing",
          rows: [
            { feature: "Ready-made recipe card designs", us: "Recipe-specific themes", them: "Large template library" },
            { feature: "Free-form design with your own elements", us: false, them: "Full layout and design control" },
            { feature: "A long recipe that doesn't fit", us: "Continues on the back of the card", them: "Resize or rearrange the layout" },
          ],
        },
        {
          title: "Printing",
          rows: [
            { feature: "Printing at home", us: "Full pages free; 4×6 cards with Pro", them: true },
            { feature: "Printed and delivered to you", us: false, them: "Canva Print, where available" },
          ],
        },
        {
          title: "Cookbooks",
          rows: [
            { feature: "Cookbook with a cover, chapters, and contents", us: "Built from your recipes", them: "Create and arrange each page yourself" },
          ],
        },
      ],
    },
    faqHeading: "Questions about RecipePrinter and Canva",
    faqs: [
      {
        question: "How do I choose between them?",
        answer:
          "If you want to design every detail yourself, Canva gives you more freedom. If you already have the recipe and want a clean printable recipe card or cookbook without laying it out by hand, RecipePrinter is built for that.",
      },
      {
        question: "What does each one cost?",
        answer: `Canva has a free plan and paid Canva Pro plans; current pricing is on Canva's site. RecipePrinter prints full-page recipes free, with no account. 4×6 cards, premium themes, and printing several recipes at once are RecipePrinter Pro, ${PRO_MONTHLY_PRICE_FALLBACK} or ${PRO_ANNUAL_PRICE_FALLBACK}. A cookbook is ${COOKBOOK_PRICE_FALLBACK}, paid once per cookbook.`,
      },
      {
        question: "Can I make a whole cookbook instead of single cards?",
        answer:
          "Yes. RecipePrinter turns your recipes into a cookbook with a cover, chapters, section pages, and a table of contents. Export the finished cookbook as a PDF to print at home or with a printing service.",
        links: [{ href: "/cookbook-maker", label: "Cookbook maker" }],
      },
      {
        question: "Can I print several recipe cards at once?",
        answer:
          "Yes, with RecipePrinter Pro. Add the recipes you want, then print them in one job with the same card size and theme, so the stack matches.",
        links: [{ href: "/print-multiple-recipes", label: "Print multiple recipes at once" }],
      },
    ],
    links: [
      { href: "/recipe-card-printer", label: "Make printable recipe cards" },
      { href: "/print-multiple-recipes", label: "Print multiple recipes at once" },
      { href: "/cookbook-maker", label: "Cookbook maker" },
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
    ],
  },
  {
    slug: "createmycookbook-alternative",
    contentUpdated: "2026-10-05",
    primaryKeyword: "CreateMyCookbook alternative",
    // Not "cookbook maker" or "family recipe book": those are other pages'
    // primaries, linked from here instead.
    secondaryKeywords: [
      "Create My Cookbook alternative",
      "alternative to CreateMyCookbook",
      "Heritage Cookbook alternative",
      "family cookbook maker",
      "cookbook from handwritten recipes",
    ],
    shortLabel: "CreateMyCookbook",
    pickerGroup: "comparison",
    intent: "Preservation and Gift SEO",
    // A competitor search wants to try the thing now, like the other
    // alternative pages.
    layout: "capture-first",
    heroImage: "printed-cookbook",
    initialImportMode: "image",
    importModes: ["url", "image", "text"],
    importSubmitLabel: "Start the cookbook",
    title: "CreateMyCookbook Alternative for Family Cookbooks | RecipePrinter",
    description:
      "Compare RecipePrinter with CreateMyCookbook. Import recipes from links, photos, and handwritten cards, build your cookbook, and export a print-ready PDF.",
    h1: "A CreateMyCookbook alternative that reads your recipes",
    anchor: "CreateMyCookbook alternative",
    lede:
      "CreateMyCookbook helps you build and order a printed cookbook. RecipePrinter starts one step earlier: paste a recipe link, upload a handwritten card or photo, or add recipe text, then organize everything into a cookbook and export the finished file to print wherever you want.",
    featureSections: [
      {
        heading: "Turn recipe cards into editable recipes",
        image: "handwritten-card",
        body:
          "Recipe cards are often the slowest part of making a family cookbook, because someone has to type them in. With RecipePrinter, you upload a photo of a handwritten card and get editable ingredients and instructions.",
        afterBody:
          "Review what it read and correct anything that was hard to make out before the recipe goes in the book.",
        links: [{ phrase: "handwritten card", href: "/handwritten-recipes-to-cookbook" }],
      },
      {
        heading: "One price for the book, not for every copy",
        image: "convert-to-pdf",
        body:
          "RecipePrinter charges once for the cookbook and gives you a print-ready PDF. From there, you decide how many copies to print and where to print them.",
        afterBody: [
          "That can make more sense if you want to print at home, use a local copy shop, compare online printing services, or make more copies later.",
          "You can keep editing the cookbook after you buy it and export an updated version whenever you need one.",
        ],
      },
      {
        heading: "Where CreateMyCookbook is the better choice",
        image: "bound-cookbook",
        body:
          "If you want one company to handle both the cookbook software and the printing, CreateMyCookbook may be the better fit. You build the book, choose a print option, and finished copies are shipped to you.",
        afterBody: [
          "It may also suit you better if you want contributors to enter their own recipes directly.",
          "RecipePrinter gives you more control over where the book gets printed, but that also means arranging the printing yourself.",
        ],
      },
    ],
    comparison: {
      competitor: "CreateMyCookbook",
      checked: "October 2026",
      groups: [
        {
          title: "Getting recipes in",
          rows: [
            { feature: "Pasted recipe text", us: "Formats the recipe for you", them: "Formats it in the recipe form" },
            { feature: "From a recipe link", us: "Reads the recipe from the link", them: "Copy the text from the page and paste it" },
            { feature: "From a photo of a handwritten card", us: "Reads it into editable text", them: "WeTypeIt: their team types it, sold as credits" },
            { feature: "Contributors adding recipes", us: "They send recipes to you to add", them: "Invite contributors to add recipes and photos" },
          ],
        },
        {
          title: "The book",
          rows: [
            { feature: "Cover, chapters, and contents", us: "Built from your recipes, all editable", them: "Built in its online designer" },
            { feature: "Binding", us: "Print-ready file for spiral or hardcover; your printer binds it", them: "Softcover, wire-o, hardback, and binder options" },
          ],
        },
        {
          title: "Printing and price",
          rows: [
            { feature: "Printed and shipped to you", us: false, them: "Ordered through CreateMyCookbook" },
            { feature: "Print-ready PDF", us: "Included with cookbook export", them: "eCookbook PDF, sold separately" },
            { feature: "What you pay", us: `${COOKBOOK_PRICE_FALLBACK} per cookbook, plus your printer`, them: "Depends on format, page count, and quantity" },
          ],
        },
      ],
    },
    faqHeading: "Questions about RecipePrinter and CreateMyCookbook",
    faqs: [
      {
        question: "How do I choose between them?",
        answer:
          "Choose CreateMyCookbook if you want the same service to help you build the book and print the finished copies. Choose RecipePrinter if your bigger problem is getting recipes from websites, photos, and handwritten cards into one cookbook, and you want to choose where the final PDF is printed.",
      },
      {
        question: "What does each one cost?",
        answer: `RecipePrinter charges ${COOKBOOK_PRICE_FALLBACK} once per cookbook, which includes the print-ready PDF. Printing is separate and depends on the printer you choose. CreateMyCookbook's pricing depends on the book format, page count, quantity, and printing options, so check its current pricing before ordering.`,
      },
      {
        question: "What about Heritage Cookbook?",
        answer:
          "Heritage Cookbook is a separate company that works in a similar way: you build the book in its online designer, can invite contributors, and order printed copies. RecipePrinter is the better fit when your main job is bringing in recipes from links, photos, or handwritten cards before you build the cookbook.",
      },
      {
        question: "Can RecipePrinter print and ship my cookbook?",
        answer:
          "No. RecipePrinter builds the cookbook and exports the finished print-ready file, and you choose where to print it. When you export, it suggests options for each format, such as Lulu for a spiral-bound book or Blurb for a hardcover, as well as your own printer or a local copy shop.",
        links: [{ href: "/how-to-print-a-cookbook", label: "How to print a cookbook" }],
      },
    ],
    links: [
      { href: "/cookbook-maker", label: "Cookbook maker" },
      { href: "/handwritten-recipes-to-cookbook", label: "Turn handwritten recipes into a cookbook" },
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/reciscan-alternative", label: "ReciScan alternative" },
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
  const metadata = pageMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
  });
  // A title that already names the site stands as written; the layout's
  // "· RecipePrinter" template would say it twice. Read off the title itself,
  // not a hand-kept slug list, which missed /christmas-recipe-book.
  if (page.title.includes(SITE_NAME)) {
    metadata.title = { absolute: page.title };
    metadata.openGraph = { ...metadata.openGraph, title: page.title };
    metadata.twitter = { ...metadata.twitter, title: page.title };
  }
  return metadata;
}
