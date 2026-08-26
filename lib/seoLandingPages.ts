import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import type { ImportMethod } from "@/types/recipe";

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

/**
 * Which claim-specific proof visual a feature row draws.
 *
 * Each kind is ONE real photograph or product screenshot, reused across every
 * page that makes the same claim — the catalogue is deliberately small so it
 * stays shootable. Until a file exists the row draws a labelled placeholder
 * naming the shot it is waiting for (see `Placeholder` in LandingVisuals).
 */
export type SeoProofKind =
  /** A cluttered recipe page on screen, with that recipe's printed card in front of it. */
  | "before-after"
  /** A printed 4x6 card in use in the kitchen. */
  | "card"
  /** Several cards from one print run, together. */
  | "queue"
  /** A screen showing the exported PDF. */
  | "pdf"
  /** A phone showing a social recipe post, next to its printed card. */
  | "social"
  /** A screen showing a cooking video, next to the printed recipe. */
  | "video"
  /** Photographing a handwritten card with a phone. */
  | "scan"
  /** A printed recipe page with a photo on it. */
  | "photo"
  /** Printed pages filed in a real binder. */
  | "binder"
  /** Inside the bound cookbook. */
  | "book"
  /** The home-printed cookbook beside the professionally bound copy. */
  | "book-home"
  /** Product screenshot: the app open in a browser on a laptop and a phone. */
  | "devices"
  /** Product screenshot: the import panel. */
  | "steps"
  /** Product screenshot: the studio, choosing size and format. */
  | "deck"
  /** Product screenshot: the template picker. */
  | "templates";

export type SeoLandingPage = {
  slug: string;
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
  /**
   * Which real printed-card photo heads the page (a PRINTED_CARDS key), and the
   * pill that ties it to the product. Both are per-page because the template
   * used to hardcode one photo and one caption for all sixteen — which put
   * "Ready for a family cookbook" on top of a page about organizing links.
   */
  heroCard?: string;
  heroAnnotation?: string;
  /** Hero button on a guide-first page, where capture sits further down. */
  ctaLabel?: string;
  /** Heading over a guide-first page's capture band. */
  captureHeading?: string;
  initialImportMode?: ImportMethod;
  /**
   * Which capture modes this page offers, in order. Defaults to all three.
   * A page whose whole subject is handwritten cards has no use for a URL
   * field, and offering one invites the wrong start.
   */
  captureModes?: ImportMethod[];
  importSubmitLabel?: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  /** One-sentence emotional hook opening the content scaffold. */
  intro?: string;
  /** "How to …" steps, renders the section and the HowTo JSON-LD. */
  howTo?: { name: string; text: string }[];
  /** 2–3 deep-dive sections, each targeting a secondary keyword, with a proof visual. */
  featureSections?: { heading: string; body: string; proof?: SeoProofKind }[];
  /** Real printed-card photo keys (PRINTED_CARDS) for the examples gallery. */
  examples?: string[];
  faqs: {
    question: string;
    answer: string;
    /**
     * Control the bolded lead. `false` turns it off, which is what a comparison
     * answer wants: it describes the other product first, and bolding that half
     * puts the emphasis on them. A string bolds exactly that opening substring,
     * for answers where the direct answer ends mid-sentence.
     */
    emphasize?: false | string;
  }[];
  links: { href: string; label: string }[];
};

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "print-recipe-from-website",
    primaryKeyword: "print recipe from website",
    secondaryKeywords: [
      "print recipe from food blog",
      "print recipe from recipe site",
      "print recipe website without clutter",
      "website to print recipes",
    ],
    intent: "Utility SEO",
    heroCard: "korean",
    heroAnnotation: "Printed from a recipe link",
    initialImportMode: "url",
    title: "Print a Recipe from Any Website",
    description:
      "Paste a recipe website or food blog link and turn it into a clean printable recipe card, page, or PDF.",
    h1: "Print a recipe from a website",
    lede:
      "Found a recipe on a food blog or recipe website that you want to cook from paper? Paste the page link into RecipePrinter and turn the recipe itself into a clean printable card, full page, or PDF.",
    intro:
      "Paste a link from a food blog and print the recipe as a card for the kitchen.",
    howTo: [
      {
        name: "Copy the recipe link",
        text: "On the food blog or recipe site, copy the page link from your browser's address bar or the app's share button.",
      },
      {
        name: "Paste it in and start",
        text: "Paste the link into the box above and start it. RecipePrinter reads the page and rebuilds the recipe as a clean, printable layout.",
      },
      {
        name: "Set the format",
        text: "Choose a recipe card or a full page, and keep or drop the photo. Every word is editable, so you can change anything before you print.",
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
          "RecipePrinter reads the page and keeps only what you cook from: the ingredient list with amounts, the numbered steps, the prep and cook times, and the servings. The backstory, the autoplay video, the comments, and the ads stay behind.",
      },
      {
        heading: "Print it the way your kitchen actually works",
        proof: "card",
        body:
          "Pick the format that fits how you cook. A 4 by 6 card drops straight into a recipe box; a full letter page suits long bakes and doubled batches, with room in the margin for notes. Keep the finished-dish photo or leave it off to save ink.",
      },
      {
        heading: "For the pages that fight back",
        proof: "steps",
        body:
          "Some recipes hide behind a login, sit on a site that blocks importers, or live only in a video's description. When a link won't import cleanly, paste the recipe text or upload a screenshot and you get the same clean printout.",
      },
    ],
    examples: ["caprese", "korean", "pesto"],
    faqs: [
      {
        question: "Can I print more than one recipe at once?",
        answer:
          "Yes, as many as you like. They print in one job, in the same size and design, which is what you want for a week of dinners or a binder section.",
      },
      {
        question: "Can I save the recipe as a PDF instead of printing?",
        answer:
          "Yes. Choose Save as PDF in the print dialog and you keep a clean copy on your phone or computer.",
      },
      {
        question: "Does it work on any recipe website?",
        answer:
          "Most food blogs and recipe sites work. Pages behind a login, or recipes that only exist in a video, need pasted text or a screenshot instead.",
      },
    ],
    links: [
      { href: "/print-recipe-from-url", label: "Print a recipe from a URL" },
      { href: "/print-recipe-without-ads", label: "Print recipes without ads" },
      { href: "/convert-recipe-to-pdf", label: "Convert a recipe to PDF" },
    ],
  },
  {
    slug: "print-recipe-without-ads",
    primaryKeyword: "print recipe without ads",
    secondaryKeywords: [
      "print recipe without pictures",
      "print recipe from website without ads",
      "clean printable recipe",
      "print recipe without clutter",
    ],
    intent: "Utility SEO",
    heroCard: "caprese",
    heroAnnotation: "Printed from a recipe link",
    initialImportMode: "url",
    title: "Print Recipes Without Ads",
    description:
      "Turn cluttered recipe pages into clean printable recipes without ads, pop-ups, comments, or wasted pages.",
    h1: "Print a recipe without ads",
    lede:
      "Recipe pages can be hard to print cleanly. RecipePrinter helps pull out the ingredients, steps, notes, timing, and servings so you can print the recipe without ads, pop-ups, autoplay videos, comments, or extra page clutter.",
    intro:
      "Paste a cluttered recipe page and print just the recipe from it.",
    howTo: [
      {
        name: "Copy the recipe's link",
        text:
          "On the food blog or recipe site, copy the page address from your browser's address bar, or use the site's own share button.",
      },
      {
        name: "Paste it in",
        text:
          "Paste the link into the box above and start it. RecipePrinter reads the page and pulls out the recipe itself.",
      },
      {
        name: "Choose what prints",
        text:
          "Keep the finished-dish photo or leave it off, and pick a 4 by 6 card or a full page. Every word is editable, so you can change anything before it goes to paper.",
      },
      {
        name: "Print it",
        text:
          "Send it to your printer, or choose Save as PDF in the print dialog to keep a clean copy instead.",
      },
    ],
    featureSections: [
      {
        heading: "Nothing to dismiss, nothing to scroll past",
        proof: "before-after",
        body:
          "A browser prints what the page is, which is why a two-paragraph recipe can arrive as six sheets: the header, the ad slots, the newsletter box, the comments. RecipePrinter starts from the recipe instead, so what lands on the counter is the length the recipe actually is.",
      },
      {
        heading: "Print without pictures, or with just the one",
        proof: "card",
        body:
          "Photos are the other half of a wasteful printout, and most recipe pages have a dozen. You get one decision instead: keep the finished-dish photo, or leave it off and print in black and white without spending color ink on a picture you'll glance at once.",
      },
      {
        heading: "For the sites whose own print button isn't much better",
        proof: "steps",
        body:
          "Plenty of recipe sites have a print button that still carries the header, the ad slots, and a page break in the middle of the ingredients. When one won't import cleanly, paste the recipe text or upload a screenshot and you get the same clean printout.",
      },
    ],
    faqs: [
      {
        question: "Can I print a recipe without pictures?",
        answer:
          "Yes. Leave the photo off and you print the recipe alone, without the images from the web page.",
      },
      {
        question: "Does RecipePrinter remove ads from recipe printouts?",
        answer:
          "Yes. It formats the recipe itself, so ads, pop-ups, comments, and navigation stay off the printed page.",
      },
      {
        question: "Can I print a recipe without the story before it?",
        answer:
          "Yes. The introduction, the childhood story, and the search padding belong to the page rather than the recipe, so none of it prints.",
      },
      {
        question: "Will the comments print?",
        answer:
          "No. Comments, related-recipe grids, newsletter sign-ups, and navigation are page furniture, not the recipe, and RecipePrinter doesn't put them on paper.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/just-the-recipe-alternative", label: "Just the Recipe alternative" },
      { href: "/convert-recipe-to-pdf", label: "Save recipe as PDF" },
    ],
  },
  {
    slug: "print-recipe-from-url",
    primaryKeyword: "print recipe from URL",
    secondaryKeywords: [
      "print recipe link",
      "recipe URL printer",
      "import recipe from website",
      "printable recipe from link",
    ],
    intent: "Utility SEO",
    heroCard: "pesto",
    heroAnnotation: "Printed from a recipe link",
    initialImportMode: "url",
    title: "Free Recipe URL Printer",
    description:
      "Paste a recipe URL and make a printable recipe card, page, or PDF you can cook from and keep. Free, no account required.",
    h1: "Print a recipe from a URL",
    lede:
      "Have the recipe link but not a good print button? RecipePrinter turns a URL from a browser, message, saved note, or social app into a printable recipe card or page.",
    intro:
      "Paste a recipe link and print it at the size you want.",
    howTo: [
      {
        name: "Get the link",
        text:
          "Copy it from the address bar, a message, a saved note, or the share button in whichever app the recipe turned up in.",
      },
      {
        name: "Paste it in",
        text:
          "Drop the link into the box above and start it. RecipePrinter opens the page, finds the recipe on it, and rebuilds it as a printable layout.",
      },
      {
        name: "Check it over",
        text:
          "Skim the ingredients and steps, and change anything you want. What you edit here is what prints.",
      },
      {
        name: "Print or save",
        text:
          "Print it for the kitchen, or choose Save as PDF to keep the recipe as a file you can open again later.",
      },
    ],
    featureSections: [
      {
        heading: "Any link, from wherever you keep them",
        proof: "steps",
        body:
          "Recipe links don't all come from browsing: one is in a text from your sister, one in a note you made at work, one in the caption of a post you saved months ago. Any of them can be pasted in, and RecipePrinter works out which part of the page is the recipe.",
      },
      {
        heading: "What comes out is a recipe, not a web page",
        proof: "card",
        body:
          "The printout is built for the counter rather than the screen: the ingredients with their amounts, the numbered steps, the times and servings, in type you can read at arm's length. Choose a 4 by 6 card for a recipe box, or a letter page when the steps run long.",
      },
      {
        heading: "Start on the phone, finish at the printer",
        proof: "devices",
        body:
          "The recipe is usually found on a phone and cooked from in a different room, so the link can go in from the phone and the printing can happen later from the computer. Nothing has to be installed, and no account is needed.",
      },
    ],
    faqs: [
      {
        question: "What kinds of recipe URLs can I use?",
        answer:
          "You can start with recipe websites, food blogs, and supported social links. If a link is blocked or incomplete, paste the recipe text or upload a screenshot.",
      },
      {
        question: "Does RecipePrinter keep the original recipe link?",
        answer:
          "Yes, when the site provides it. The printed recipe can carry the source so you know where it came from.",
      },
      {
        question: "What if the link doesn't work?",
        answer:
          "Paste the recipe text or upload a screenshot instead. Some pages sit behind a login or block importers, and both routes give the same printable result.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
    ],
  },
  {
    slug: "convert-recipe-to-pdf",
    primaryKeyword: "convert recipe to PDF",
    secondaryKeywords: [
      "recipe PDF generator",
      "save recipe as PDF",
      "recipe to PDF",
      "printable recipe PDF",
      "save online recipe as PDF",
    ],
    intent: "Utility SEO",
    heroCard: "korean",
    heroAnnotation: "Printed at home with RecipePrinter",
    initialImportMode: "url",
    title: "Free Recipe to PDF Converter",
    description:
      "Turn recipes from links, photos, screenshots, or text into printable PDFs for saving, sharing, and cooking.",
    h1: "Convert a recipe to PDF",
    lede:
      "RecipePrinter helps you turn online recipes into print-ready pages that can be saved as PDFs and kept with the rest of your recipe collection.",
    intro:
      "Bring a recipe in and save it as a PDF you own.",
    howTo: [
      {
        name: "Bring the recipe in",
        text:
          "Paste the recipe's link, upload a photo or screenshot of it, or paste the text. RecipePrinter rebuilds it as a clean, structured recipe.",
      },
      {
        name: "Set the page up",
        text:
          "Choose a full letter page or a 4 by 6 card, and decide whether the finished-dish photo comes along. This is the layout the PDF will have.",
      },
      {
        name: "Open the print dialog",
        text:
          "Print the recipe as you normally would. Every browser's print dialog can write to a file instead of to paper.",
      },
      {
        name: "Choose Save as PDF",
        text:
          "Pick Save as PDF on a computer, or Print to PDF from the share sheet on a phone, and save it wherever you keep your recipes.",
      },
    ],
    featureSections: [
      {
        heading: "A recipe PDF you can actually read later",
        proof: "pdf",
        body:
          "Saving a web page as a PDF saves the web page: the banner, the ad slots, the comment thread, and a recipe somewhere in the middle. What gets written here is the recipe on its own, so the file is one or two readable pages rather than nine of scrolling.",
      },
      {
        heading: "The same recipe, in the format you need it",
        proof: "deck",
        body:
          "The PDF inherits whatever you chose on screen. A letter page suits a long bake and leaves a margin for notes; a 4 by 6 card prints at card size rather than shrinking a page down to it. Keeping the photo makes a nicer file to share.",
      },
      {
        heading: "Several recipes, one file",
        proof: "queue",
        body:
          "Recipes rarely arrive one at a time. Add a few before you print and they go into the same job, which means one PDF holding a week of dinners, a set of holiday bakes, or everything you hand to someone who has just moved out.",
      },
    ],
    faqs: [
      {
        question: "Can RecipePrinter export a recipe PDF directly?",
        answer:
          "Yes, through the print dialog. Choose Save as PDF there and you get the same layout as a file.",
      },
      {
        question: "Can I make PDFs from screenshots or photos?",
        answer:
          "Yes. Upload a screenshot, cookbook page, handwritten recipe card, or saved image, then print or save the formatted result as a PDF.",
      },
      {
        question: "Can I save a recipe as a PDF on my phone?",
        answer:
          "Yes. Tap the share or print option and choose Print to PDF or Save to Files. The file matches the layout you set up on screen.",
      },
      {
        question: "Is the PDF the same as printing?",
        answer:
          "It's the same layout written to a file instead of paper. Your choices about size, photo, and wording are already in it.",
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
    heroCard: "caprese",
    heroAnnotation: "A recipe card, printed at home",
    initialImportMode: "url",
    importSubmitLabel: "Make printable recipe card",
    title: "Free Printable Recipe Card Maker",
    description:
      "Make printable recipe cards from links, photos, screenshots, or text, including 4x6 and recipe-box-friendly layouts.",
    h1: "Printable recipe card generator",
    lede:
      "Turn a recipe you found online into a printable recipe card you can cook from, share, file, or add to a recipe box. This page is focused on card layouts, recipe boxes, and small-format printouts rather than full-page recipes. Rather than build a card from a blank template, you start from a real recipe and choose the layout, so the design work is already done.",
    intro:
      "Turn any recipe into a card at the size a recipe box expects.",
    howTo: [
      {
        name: "Bring in the recipe",
        text:
          "Paste a link, upload a photo of a handwritten card, or paste the text. RecipePrinter turns any of them into the same structured recipe.",
      },
      {
        name: "Pick the card size",
        text:
          "Choose 4 by 6 for a standard recipe box, or the larger card when the ingredient list is long. The layout is built for that size, not shrunk to fit it.",
      },
      {
        name: "Choose a design",
        text:
          "Pick a template, decide whether the finished-dish photo appears on the card, and adjust anything that reads awkwardly.",
      },
      {
        name: "Print onto card stock",
        text:
          "Print on index cards or card stock. Print single-sided, or use both sides when a recipe runs long.",
      },
    ],
    featureSections: [
      {
        heading: "Built for the card, not shrunk onto it",
        proof: "card",
        body:
          "A page squeezed down to card size gives you six-point type and a photo you can't see. These layouts are set at card size from the start: the ingredients in a column you can follow with a wet finger, the steps numbered beside them, the times and servings at a glance.",
      },
      {
        heading: "Designs that suit the recipe",
        proof: "templates",
        body:
          "The card templates differ in more than color. Some are plain and tight for a long ingredient list, some leave room for a photo, and some are made to be given away rather than filed.",
      },
      {
        heading: "A boxful in one printing",
        proof: "queue",
        body:
          "Cards are usually made in batches: the ten recipes you cook most, the favorites for a gift box, the set someone asked you for. Add them all before printing and they come out in one run, in the same size and the same design.",
      },
    ],
    examples: ["korean", "caprese", "pesto"],
    faqs: [
      {
        question: "Can I make 4x6 recipe cards from online recipes?",
        answer:
          "Yes. Paste a recipe link into RecipePrinter and choose a printable card layout, including card-style formats that work well for 4x6 recipe cards.",
      },
      {
        question: "Can I print multiple recipe cards at once?",
        answer:
          "Yes. Add several recipes to your print queue and print the batch together.",
      },
      {
        question: "What size are the recipe cards?",
        answer:
          "4 by 6, the size a recipe box and index-card binder are built around, with a larger card for long ingredient lists. Both print at true size.",
      },
      {
        question: "Can I print recipe cards on index cards?",
        answer:
          "Yes. Load index cards or card stock and choose the matching size in the print dialog.",
      },
    ],
    links: [
      { href: "/print-recipe-from-url", label: "Print from a URL" },
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
    heroCard: "pesto",
    heroAnnotation: "Printed from a recipe link",
    initialImportMode: "url",
    title: "Free Pinterest Recipe Printer",
    description:
      "Turn Pinterest recipe links, screenshots, or saved recipe text into printable recipe cards, pages, and PDFs.",
    h1: "Print Pinterest recipes",
    lede:
      "Pinterest is a great place to find recipes. RecipePrinter helps move the ones you want to make from a saved pin into a printable recipe you can cook from.",
    intro:
      "Take the link from a saved pin and print the recipe as a card.",
    howTo: [
      {
        name: "Open the pin",
        text:
          "Tap the saved pin and open the recipe it points to. Most food pins are a picture standing in front of a recipe page.",
      },
      {
        name: "Copy the link",
        text:
          "Use the pin's share button, or copy the address of the page it opens. Either one is what goes into the box above.",
      },
      {
        name: "Paste it in",
        text:
          "RecipePrinter reads the page behind the pin and rebuilds the recipe as a printable card or page, without the site around it.",
      },
      {
        name: "Print it and file it",
        text:
          "Print onto card stock for a recipe box or a binder, so the recipe stops depending on you finding the pin again.",
      },
    ],
    featureSections: [
      {
        heading: "From a saved pin to something you can cook from",
        proof: "social",
        body:
          "A pin is a photo with a link underneath it, which is why a board is so easy to fill and so hard to cook from. Open the pin, take the link it points at, and paste it in: what comes back is the ingredients, the steps, the timings, and the servings, laid out for paper.",
      },
      {
        heading: "The pins that go nowhere useful",
        proof: "card",
        body:
          "Not every pin leads to a working page. Some point at a site that's gone, some at a login, and some have the whole recipe written into the image, so upload a screenshot of the pin or paste the text instead.",
      },
      {
        heading: "Print the board you actually cook from",
        proof: "queue",
        body:
          "Boards grow faster than kitchens do. Take the ten you've made, or mean to make this month, and print them in one run, in one size and one design, and you have a small set of cards worth having.",
      },
    ],
    faqs: [
      {
        question: "How do I print Pinterest recipes from an iPhone?",
        answer:
          "Open the pin, copy the recipe link it points to, and paste that in. If the pin has no link, use a screenshot or paste the recipe text.",
      },
      {
        question: "Can I organize Pinterest recipes after printing?",
        answer:
          "Yes. Printed recipe cards and pages work well in binders, folders, and seasonal collections.",
      },
      {
        question: "Do I need a Pinterest account to print a pin's recipe?",
        answer:
          "No. RecipePrinter works from the recipe page the pin points to, so what matters is the link, not the account.",
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
    heroCard: "korean",
    heroAnnotation: "Printed at home with RecipePrinter",
    initialImportMode: "text",
    title: "Free Instagram Recipe Printer",
    description:
      "Turn Instagram recipe captions, screenshots, links, or pasted text into printable recipes you can cook from.",
    h1: "Print Instagram recipes",
    lede:
      "Instagram recipes and Reels are easy to save and hard to cook from. RecipePrinter helps turn recipe captions, screenshots, links, and pasted text into printable cards or pages.",
    intro:
      "Paste a caption or upload a screenshot and print it as a proper recipe.",
    howTo: [
      {
        name: "Copy the caption",
        text:
          "Open the post or Reel and copy the caption text, which is where the ingredients and steps usually are. If the caption can't be copied, screenshot it.",
      },
      {
        name: "Paste it in",
        text:
          "Paste the text into the box above, or upload the screenshots. RecipePrinter sorts a run-on caption into ingredients, steps, times, and servings.",
      },
      {
        name: "Tidy it up",
        text:
          "Captions are written for scrolling, so check the amounts and the order. Every word is editable before you print.",
      },
      {
        name: "Print or save",
        text:
          "Print a card for the kitchen, or Save as PDF so the recipe survives the account going private or the post being deleted.",
      },
    ],
    featureSections: [
      {
        heading: "A caption isn't a recipe until something structures it",
        proof: "social",
        body:
          "Instagram recipes arrive as one long block of text with emoji between the amounts, a story at the top, and the steps squeezed in at the end. Pasting that in separates it out: ingredients with quantities in one column, the steps numbered in order, the timings and servings where you can see them.",
      },
      {
        heading: "When the caption can't be copied",
        proof: "steps",
        body:
          "Reels often keep the recipe on screen rather than in the caption, and some posts won't let you select the text at all. Screenshot what you can see, including a carousel's separate slides, and upload the pictures instead.",
      },
      {
        heading: "Saved posts disappear; paper doesn't",
        proof: "card",
        body:
          "A saved collection depends on the account staying up, the post staying public, and you remembering which of four hundred saves it was. A printed card, or a PDF in your files, is yours either way.",
      },
    ],
    faqs: [
      {
        question: "Can I print a recipe from an Instagram Reel?",
        answer:
          "Yes. Copy the Reel caption, notes, or source link when available, or upload screenshots of the recipe text. RecipePrinter will format the recipe into a printable card or page.",
      },
      {
        question: "Can I use a screenshot of an Instagram recipe?",
        answer:
          "Yes. Upload a screenshot when that's the easiest way to capture the recipe.",
      },
      {
        question: "Can RecipePrinter open an Instagram link directly?",
        answer:
          "Not reliably. Instagram limits what a link gives up, so paste the caption text or upload a screenshot instead.",
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
    heroCard: "caprese",
    heroAnnotation: "Printed at home with RecipePrinter",
    initialImportMode: "text",
    title: "Free Facebook Recipe Printer",
    description:
      "Turn Facebook recipe posts, Reels, screenshots, links, or copied text into printable recipe cards, pages, and PDFs.",
    h1: "Print recipes from Facebook",
    lede:
      "Facebook recipes often show up in posts, group comments, Reels, captions, screenshots, and shared links. RecipePrinter helps turn the parts you can copy or capture into a printable recipe you can cook from.",
    intro:
      "Copy the post or the comment that holds the recipe and print it.",
    howTo: [
      {
        name: "Find the recipe text",
        text:
          "Copy the post, or the comment where someone typed the real version. If the text won't select, take a screenshot of it.",
      },
      {
        name: "Paste it in or upload it",
        text:
          "Put the text into the box above, or upload the screenshots, and RecipePrinter structures it into a proper recipe.",
      },
      {
        name: "Check the amounts",
        text:
          "Posts often leave out a quantity or a step, so add anything missing before it goes onto a card you'll keep for years.",
      },
      {
        name: "Print it",
        text:
          "Print a card or a page, so the recipe stops living in a feed you can't search.",
      },
    ],
    featureSections: [
      {
        heading: "Posts, comments, and the version that actually works",
        proof: "social",
        body:
          "Facebook recipes are rarely in one tidy place: the post has the photo, the first comment has the correction, and the version everyone actually makes is the one someone retyped further down. Paste in whichever text is the real recipe and it comes back structured.",
      },
      {
        heading: "When Facebook won't let you copy",
        proof: "steps",
        body:
          "Some posts, and most Reels, won't give up their text. Screenshot the post, the comment, or the on-screen instructions and upload the images instead, which also works for a photo of a recipe someone posted from a book.",
      },
    ],
    faqs: [
      {
        question: "Can I print recipes from Facebook Reels?",
        answer:
          "Yes. Use the recipe text, caption, screenshots, or source link when available. RecipePrinter can format copied text or screenshots into a printable recipe card or page.",
      },
      {
        question: "What if Facebook won't let me copy the recipe?",
        answer:
          "Take screenshots of the recipe text or copy the source link if the creator included one. RecipePrinter can start from screenshots, photos, pasted text, or URLs.",
      },
      {
        question: "Can I print a recipe from a Facebook group post?",
        answer:
          "Yes. Copy the text of the post or the comment that holds the recipe and paste it in, or upload a screenshot if the text can't be selected.",
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
    heroCard: "pesto",
    heroAnnotation: "Printed at home with RecipePrinter",
    initialImportMode: "text",
    title: "Free TikTok Recipe Printer",
    description:
      "Turn TikTok recipe captions, screenshots, links, or pasted text into printable recipe cards, pages, and PDFs.",
    h1: "Print TikTok recipes",
    lede:
      "TikTok is good for finding quick recipe ideas. RecipePrinter helps turn the recipes you want to repeat into something stable enough to cook from.",
    intro:
      "Paste the caption or upload the frames and print the recipe from them.",
    howTo: [
      {
        name: "Get the recipe out of the video",
        text:
          "Copy the caption if it holds the ingredients, or screenshot the frames where the amounts and steps are shown.",
      },
      {
        name: "Paste it in or upload the frames",
        text:
          "Put the text into the box above, or upload the screenshots, and RecipePrinter builds a structured recipe from what is there.",
      },
      {
        name: "Fill in what's missing",
        text:
          "Videos often leave out oven temperatures and quantities, so add anything missing while you still remember it.",
      },
      {
        name: "Print it or save it as a PDF",
        text:
          "Print a card for the counter, or save a PDF so the recipe outlives the video.",
      },
    ],
    featureSections: [
      {
        heading: "A video is a demonstration, not a reference",
        proof: "video",
        body:
          "Watching someone cook is the best way to learn a technique and the worst way to follow one: the amounts appear for a moment, and pausing means touching a screen you've just had in the flour. On paper the ingredients are a list you can check off and the steps are numbered.",
      },
      {
        heading: "Caption, on-screen text, or a screenshot",
        proof: "steps",
        body:
          "Where the recipe lives varies by creator: some put the whole thing in the caption, some only ever show it on screen, some leave it in a pinned comment. Paste in whichever text exists, or upload screenshots of the frames that hold it.",
      },
      {
        heading: "The ones you make more than once",
        proof: "card",
        body:
          "Most saved videos are never watched again. The few you repeat are worth taking out of the app: printed onto a card, they join the rest of your recipes.",
      },
    ],
    faqs: [
      {
        question: "What if the recipe is only in the comments?",
        answer:
          "Paste that comment in. RecipePrinter structures whatever recipe text you give it, wherever on the page it came from.",
      },
      {
        question: "Can RecipePrinter print directly from TikTok?",
        answer:
          "Not from the video itself. Paste the caption or upload screenshots of the frames showing the ingredients and steps, which is also the surest way to catch on-screen details.",
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
    heroCard: "korean",
    heroAnnotation: "Printed at home with RecipePrinter",
    initialImportMode: "text",
    title: "Free YouTube Recipe Printer",
    description:
      "Turn YouTube recipe descriptions, transcripts, screenshots, links, or copied notes into printable recipes.",
    h1: "Print a recipe from YouTube",
    lede:
      "YouTube recipes are helpful to watch and frustrating to cook from when the ingredients live in a description, transcript, pinned comment, or on-screen text. RecipePrinter helps turn the recipe details into a printable card or page.",
    intro:
      "Gather what the video wrote down and print it on one page.",
    howTo: [
      {
        name: "Copy the description",
        text:
          "Open the video's description, where most cooking channels put the ingredients and often the whole recipe, and copy the recipe part of it.",
      },
      {
        name: "Add anything that's only in the video",
        text:
          "Check the pinned comment and any on-screen text for temperatures, pan sizes, or timings the description leaves out. Screenshot those frames if it's easier.",
      },
      {
        name: "Paste it in",
        text:
          "Put the text into the box above, or upload the screenshots, and RecipePrinter sorts it into ingredients, steps, times, and servings.",
      },
      {
        name: "Print it or save it as a PDF",
        text:
          "Print a page for the kitchen, or save a PDF you can open next time without hunting for the video.",
      },
    ],
    featureSections: [
      {
        heading: "Everything the video knows, on one page",
        proof: "video",
        body:
          "Cooking channels split a recipe across places: the ingredients in the description, the correction in a pinned comment, the oven temperature on screen. Gathering those into one printable recipe means the page beside the stove has all of it.",
      },
      {
        heading: "A file you can find again",
        proof: "pdf",
        body:
          "Descriptions get edited, channels take videos down, and a watch-later list isn't a recipe collection. Saving the recipe as a PDF means the version you cooked from is the version you still have.",
      },
      {
        heading: "Long bakes want a full page",
        proof: "card",
        body:
          "Video recipes are often the long ones: laminated doughs, braises, anything with resting time. A full letter page suits those better than a card, with room to note what the second attempt needed.",
      },
    ],
    faqs: [
      {
        question: "Where do cooking channels usually put the recipe?",
        answer:
          "Most put the ingredients in the description. Corrections tend to be in a pinned comment, and oven temperatures are often only on screen.",
      },
      {
        question: "Can RecipePrinter extract a full recipe from any YouTube video?",
        answer:
          "Only where the recipe is written down: the description, a pinned comment, the transcript, or frames you can screenshot. Where a video has none of that, type in your own notes.",
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
    primaryKeyword: "organize recipes",
    secondaryKeywords: [
      "recipe organization ideas",
      "organize recipes from Pinterest",
      "recipe collection ideas",
      "how to save recipes",
    ],
    intent: "Organization SEO",
    heroCard: "caprese",
    heroAnnotation: "Printed from a saved link",
    ctaLabel: "Start organizing",
    captureHeading: "Start with one recipe",
    title: "Organize Recipes from the Internet",
    description:
      "Turn scattered online recipes into printable cards, PDFs, binders, and collections you can cook from and keep.",
    h1: "Organize recipes from the internet",
    lede:
      "RecipePrinter helps turn scattered links, screenshots, saved posts, and copied text into a recipe collection you can cook from and keep.",
    intro:
      "Collect the recipes you want to keep, print them in one format, and add to them as you go.",
    howTo: [
      {
        name: "Gather the recipes",
        text:
          "The ones you want to keep: links you saved, screenshots, posts from a group chat, photos of handwritten cards.",
      },
      {
        name: "Bring each one in",
        text:
          "Paste a link, upload a screenshot or a photo of a card, or paste the text. Whatever the source, it comes out in the same structured shape.",
      },
      {
        name: "Print them in one format",
        text:
          "Choose cards for a box or pages for a binder. Printing them together keeps the size and the design consistent across the set.",
      },
      {
        name: "Keep adding as you go",
        text:
          "Add the next one whenever you find it. A batch of two prints the same way as a batch of twenty, and a collection worth binding can become a cookbook later.",
      },
    ],
    featureSections: [
      {
        heading: "One layout, whatever the source",
        proof: "binder",
        body:
          "A blog link, a screenshot from a group chat, and a photo of your mother's card all get set in the same layout at the same size. That's what turns a stack of printouts into something you can flip through and file.",
      },
      {
        heading: "Group them however your kitchen works",
        proof: "queue",
        body:
          "Weeknights, weekend cooking, baking, holidays, the handful of dishes everyone in the house will eat. Loose pages sit behind whatever dividers you like; bound into a cookbook, those same groups become chapters, with a table of contents that numbers itself.",
      },
      {
        heading: "A printed recipe never expires",
        proof: "card",
        body:
          "Printed cards and saved PDFs work on their own: no login, no subscription, nothing to move if you change tools. Sign in if you want a project saved to reopen later, though nothing in the collection depends on it.",
      },
    ],
    faqs: [
      {
        question: "What is the easiest way to organize online recipes?",
        answer:
          "Use RecipePrinter to print the ones you cook most, all in the same format, then file them by the categories your kitchen uses. Paste a link, upload a screenshot, or paste the text, and every recipe comes out as a card or a page that matches the rest, so the collection stays consistent however it grows.",
      },
      {
        question: "What can I make from the collection?",
        answer:
          "Recipe cards for a box, letter pages for a binder, PDFs to keep on a device, or a bound cookbook with chapters and a table of contents that numbers itself. The same recipes go into any of them, so nothing has to be retyped to change your mind.",
      },
      {
        question: "How many recipes should I start with?",
        answer:
          "Start with the ones you've cooked twice. You can add more any time, so the collection doesn't have to be finished in one sitting.",
      },
    ],
    links: [
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/family-recipe-book", label: "Make a family cookbook" },
      { href: "/printable-recipe-card-generator", label: "Printable recipe cards" },
    ],
  },
  {
    slug: "recipe-binder",
    primaryKeyword: "recipe binder",
    secondaryKeywords: [
      "recipe binder ideas",
      "recipe binder printables",
      "recipe notebook ideas",
      "recipe organization ideas",
    ],
    intent: "Organization SEO",
    heroCard: "korean",
    heroAnnotation: "Printed at home with RecipePrinter",
    ctaLabel: "Start your binder",
    captureHeading: "Start your binder",
    title: "Recipe Binder Ideas for Online Recipes",
    description:
      "Build a recipe binder from online recipes, printable recipe cards, PDFs, screenshots, and family favorites.",
    h1: "Recipe binder ideas for online recipes",
    lede:
      "RecipePrinter turns online recipes, handwritten cards, and screenshots into matching printable pages, cards, and PDFs to file behind your own dividers.",
    intro:
      "Print online recipes as pages you can file, and keep adding to them for years.",
    howTo: [
      {
        name: "Bring the recipes in",
        text:
          "Paste links, upload photos of handwritten cards, or paste text. Every source ends up in the same layout, so the pages match each other.",
      },
      {
        name: "Choose the size",
        text:
          "Letter pages for a standard three-ring binder, or 4 by 6 cards for a small binder or a recipe box. The layout is built for whichever you pick.",
      },
      {
        name: "Print in batches",
        text:
          "Printing a section at a time gets you a run of pages that match, in one trip to the printer.",
      },
      {
        name: "Put them in the binder",
        text:
          "Hole-punch the pages or use sleeves, and group them behind tabs: weeknights, baking, holidays, whatever your kitchen needs.",
      },
    ],
    featureSections: [
      {
        heading: "The page comes out ready to hole-punch",
        proof: "binder",
        body:
          "RecipePrinter sets each recipe on a full letter page: type large enough to read from three feet away, the ingredients in one column, the steps numbered beside them, and a margin wide enough for a note about what you changed. It comes off your printer sized for a standard binder, with room at the edge for the holes.",
      },
      {
        heading: "It never has to be finished",
        proof: "card",
        body:
          "A binder takes one page at a time: print tonight's keeper and file it, reprint a page when it wears out, pull one out for whoever asked for it. Cards and full pages come out in the same design, so a binder you add to for years still reads as one collection rather than a set of eras.",
      },
      {
        heading: "When the binder wants to become a book",
        proof: "book",
        body:
          "Dividers and tabs are yours to buy and move around. Chapters and a table of contents come with the cookbook: when a set stops changing, RecipePrinter binds those same recipes into a book with a cover, printed at home as a spiral-bound copy or ordered as a hardcover.",
      },
    ],
    faqs: [
      {
        question: "Should a recipe binder use cards or full pages?",
        answer:
          "Both can work. Full pages are easiest for long recipes, while cards are nice for short favorites, baking, and gifts.",
      },
      {
        question: "Can I make a binder from recipes I found online?",
        answer:
          "Yes. RecipePrinter formats online recipes into printable pages and cards you can file in a physical binder.",
      },
      {
        question: "What should go behind each divider?",
        answer:
          "Categories your kitchen uses: weeknights, baking, holidays, and the dishes people ask you for.",
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
    primaryKeyword: "preserve family recipes",
    secondaryKeywords: [
      "handwritten recipe preservation",
      "recipe keepsake",
      "family recipe book ideas",
      "recipe memory book",
    ],
    intent: "Preservation and Gift SEO",
    heroCard: "pesto",
    heroAnnotation: "Printed to keep",
    ctaLabel: "Start with one recipe",
    captureHeading: "Start with one recipe",
    captureModes: ["image", "text"],
    initialImportMode: "image",
    title: "Preserve Family Recipes",
    description:
      "Preserve family recipes by turning handwritten cards, photos, screenshots, and text into printable keepsakes and a bound family cookbook.",
    h1: "Preserve family recipes",
    lede:
      "RecipePrinter turns handwritten cards, photos, and text into printable pages worth keeping, then gathers them into a keepsake family cookbook.",
    intro:
      "Take a photo of a handwritten card and print a copy you can cook from.",
    howTo: [
      {
        name: "Take photos of the originals",
        text:
          "Lay each card flat in good light and take a photo, or scan it. Worth doing first, while the cards are out.",
      },
      {
        name: "Turn them into printed pages",
        text:
          "Upload the photos and RecipePrinter reads the recipe off the card, then sets it in type you can read at arm's length.",
      },
      {
        name: "Keep what the card knows",
        text:
          "Add the notes that were never written down: who it came from, the substitution that makes it work, the holiday it belongs to.",
      },
      {
        name: "Print, and keep the originals",
        text:
          "Print a copy for the kitchen so the fragile original can go back in the box, and gather the set into a keepsake cookbook when you're ready.",
      },
    ],
    featureSections: [
      {
        heading: "One photo now is the backup",
        proof: "scan",
        body:
          "A card that has been cooked from for fifty years is exposed to grease, damp, and one house move, and a photo taken today is the insurance. RecipePrinter reads the ingredients and steps straight off that photo, handwriting and all, and sets them in type you can cook from while the card itself goes back in the box.",
      },
      {
        heading: "Room for who it came from",
        proof: "photo",
        body:
          "Every recipe in a cookbook has a line above the ingredients for a note or a memory: who gave it to you, what they always said about it, the year it stopped being a secret. Put the photo of the card on the page as well, and the handwriting keeps its place next to the words.",
      },
      {
        heading: "A copy for everyone who cooks it",
        proof: "book",
        body:
          "A single card in a drawer helps one household. The same recipes, bound into a cookbook with a cover, chapters, and a table of contents, can be printed at home or ordered as bound copies for everyone in the family.",
      },
    ],
    faqs: [
      {
        question: "Can I print recipes from old handwritten cards?",
        answer:
          "Yes. Upload a photo of the card and RecipePrinter reads the recipe off it, then sets it as a page you can print and cook from.",
      },
      {
        question: "Can preserved recipes become a family cookbook?",
        answer:
          "Yes. Group them into chapters, add a cover and an automatic table of contents, and print the finished cookbook at home or through a professional printer.",
      },
      {
        question: "What if the handwriting is hard to read?",
        answer:
          "Upload it anyway, and change anything that didn't come through. Every word is editable, and if a card is too faded to read, paste the recipe in as text instead.",
      },
    ],
    links: [
      { href: "/family-recipe-book", label: "Create a family recipe book" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
      { href: "/reciscan-alternative", label: "ReciScan alternative" },
    ],
  },
  {
    slug: "family-recipe-book",
    primaryKeyword: "family recipe book",
    secondaryKeywords: [
      "create a family cookbook",
      "family cookbook printing",
      "recipe memory book",
      "custom cookbook",
    ],
    intent: "Preservation and Gift SEO",
    heroCard: "pesto",
    heroAnnotation: "Ready for a family cookbook",
    ctaLabel: "Start your cookbook",
    captureHeading: "Start your family cookbook",
    title: "Family Recipe Book Ideas",
    description:
      "Create a family recipe book from printed recipes, handwritten cards, online favorites, photos, and kitchen notes.",
    h1: "Family recipe book ideas",
    lede:
      "A family recipe book can start with one recipe. RecipePrinter turns online recipes, handwritten cards, photos, and typed-in notes into matching printed pages, then binds them into a cookbook with a cover, chapters, and a table of contents.",
    intro:
      "Gather scattered recipes and bind them into a book worth giving.",
    howTo: [
      {
        name: "Gather the recipes",
        text: "Bring together the recipes you want to keep: paste links, take photos of handwritten cards, upload screenshots, or type in the ones that only live in someone's head.",
      },
      {
        name: "Set each one on a page",
        text: "RecipePrinter sets every recipe on a consistent page, so a card from a recipe box and a text from last week belong in the same book.",
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
          "Family recipes arrive in every format: a stained index card, a screenshot from a group chat, a link a cousin sent, one that only lives in someone's head. RecipePrinter sets each one on a consistent page, so a card from 1975 and a text from last week belong in the same book.",
      },
      {
        heading: "Keep the details that make it yours",
        proof: "book",
        body:
          "A good family cookbook is as much about the people as the food. Keep the note about who a recipe came from and the substitution that makes it work, and place a photo of the dish, the cook, or the original card next to the typed version.",
      },
      {
        heading: "Print one at home, or a bound copy for everyone",
        proof: "book-home",
        body:
          "Print a copy at home to flip through and check, then export a print-ready file to order bound books from a professional printer. A finished cookbook makes a keepsake gift for a wedding, a milestone birthday, or the holidays.",
      },
    ],
    examples: ["pesto", "caprese", "korean"],
    faqs: [
      {
        question: "What should go in a family recipe book?",
        answer:
          "The recipes people ask for, notes on who made them, substitutions, and photos. The small stories are what make it worth keeping.",
      },
      {
        question: "Can I add recipes to the book over time?",
        answer:
          "Yes. Add recipes as you collect them, and the table of contents renumbers itself so the book stays in order.",
      },
      {
        question: "How many recipes make a cookbook?",
        answer:
          "There's no minimum. Twenty makes a real book, and a chapter of eight is enough to hand to someone at a wedding.",
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
    primaryKeyword: "Just the Recipe alternative",
    secondaryKeywords: [
      "recipe printer alternative",
      "print recipe without ads",
      "print recipe from website",
      "clean printable recipes",
      "just the recipe alternative for printing",
    ],
    intent: "Utility SEO",
    heroCard: "caprese",
    heroAnnotation: "Printed from a recipe link",
    initialImportMode: "url",
    title: "Just the Recipe Alternative",
    description:
      "Looking for a Just the Recipe alternative? RecipePrinter turns online recipes into printable cards, pages, and PDFs worth keeping.",
    h1: "A Just the Recipe alternative for printing",
    lede:
      "RecipePrinter is for cooks who want a clean recipe plus a real print layout. Paste a recipe link and turn it into a printable card, page, or PDF for your kitchen.",
    intro:
      "Paste a cluttered page and print a card you can cook from.",
    howTo: [
      {
        name: "Paste the recipe link",
        text:
          "Nothing to install. Paste the link into the box above from whichever device you have to hand.",
      },
      {
        name: "Get the recipe on its own",
        text:
          "RecipePrinter reads the page and keeps the ingredients, steps, times, and servings, leaving the ads, the backstory, and the comments behind.",
      },
      {
        name: "Lay it out for paper",
        text:
          "Choose a 4 by 6 card or a full page, keep or drop the photo, and pick a design. This is the part that makes it a printed thing rather than a cleaner screen.",
      },
      {
        name: "Print it or save it",
        text:
          "Print for the kitchen, or Save as PDF to keep the recipe as a file rather than as a link.",
      },
    ],
    featureSections: [
      {
        heading: "Reading it cleanly and cooking from it are different problems",
        proof: "before-after",
        body:
          "Just the Recipe strips the page and keeps the recipe in an app you cook from on a screen. RecipePrinter takes the same clean recipe and puts it on paper, at a size you can read from across the counter, with nothing to dim or lock while your hands are busy.",
      },
      {
        heading: "A layout, not only cleaner text",
        proof: "templates",
        body:
          "Because the output is a printed thing, it's designed as one: card or full page, photo or no photo, a template that suits a weeknight recipe or one you're giving away. The ingredients sit where you can follow them and the steps where you can find your place.",
      },
      {
        heading: "One collection, in one format",
        proof: "queue",
        body:
          "Recipes arrive from everywhere: a link, a screenshot, a photo of a handwritten card, a method someone typed into a message. They all come out in the same layout at the same size, which is what turns them into one set of cards, one binder, or one bound cookbook.",
      },
    ],
    faqs: [
      {
        question: "How is RecipePrinter different from Just the Recipe?",
        emphasize: false,
        answer:
          "Just the Recipe is an app and website for keeping recipes and cooking from them on a screen, with collections that sync across your devices. RecipePrinter is for getting them off the screen: printable cards, letter pages, PDFs, and a cookbook you can bind.",
      },
      {
        question: "Can RecipePrinter print recipes without page clutter?",
        answer:
          "Yes. RecipePrinter formats the recipe itself for paper, so ads, pop-ups, comments, and extra web page clutter stay off the printed recipe.",
      },
      {
        question: "Do I need an account to print?",
        answer:
          "No. Printing is free and needs no account, on a phone, a tablet, or a computer. Signing in only matters if you want to save a project and reopen it later.",
      },
    ],
    links: [
      { href: "/print-recipe-from-website", label: "Print a recipe from a website" },
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/convert-recipe-to-pdf", label: "Convert a recipe to PDF" },
    ],
  },
  {
    slug: "reciscan-alternative",
    primaryKeyword: "ReciScan alternative",
    secondaryKeywords: [
      "recipe scanner alternative",
      "recipe card maker",
      "preserve family recipes",
      "family recipe book ideas",
    ],
    intent: "Preservation and Gift SEO",
    heroCard: "caprese",
    heroAnnotation: "Printed at home with RecipePrinter",
    ctaLabel: "Start with one recipe",
    captureHeading: "Start with one recipe",
    initialImportMode: "image",
    title: "ReciScan Alternative",
    description:
      "Looking for a ReciScan alternative? RecipePrinter turns links, screenshots, photos, and text into printable recipe pages and cards.",
    h1: "A ReciScan alternative for printed recipes",
    lede:
      "RecipePrinter helps you turn recipes from the internet, handwritten cards, screenshots, and text into printable pages, cards, and PDFs you can cook from and keep.",
    intro:
      "Take a photo of a handwritten card and print a copy you can cook from the same day.",
    howTo: [
      {
        name: "Take a photo of the card",
        text:
          "Take a photo of the handwritten card, the cookbook page, or the screenshot. A phone camera in decent light is enough.",
      },
      {
        name: "Upload it",
        text:
          "RecipePrinter reads the recipe off the picture and turns it into a structured recipe with ingredients, steps, times, and servings.",
      },
      {
        name: "Check it over",
        text:
          "Read it against the original and change anything you want. Every word is editable, so an amount or a note can go in before you print.",
      },
      {
        name: "Print it tonight",
        text:
          "Print a card or a page on your own printer and cook from it the same day. When you have a set worth binding, export the whole thing as a cookbook.",
      },
    ],
    featureSections: [
      {
        heading: "Nothing to install, on any device you own",
        proof: "devices",
        body:
          "Take a photo of the card with whatever camera is nearest, upload the picture, and the recipe comes back set in type and ready to print. There's no app to download and no account to make, and because it's a web page you can take photos of the cards in the kitchen and print them from the computer in the next room.",
      },
      {
        heading: "One card tonight, or a whole book later",
        proof: "book",
        body:
          "ReciScan is built around the finished book: you assemble it in the app, and their printing service prints and ships it, which takes about two weeks. With RecipePrinter you do the printing. Run a single card tonight on the printer you already own, or export the whole collection as a print-ready cookbook PDF, for home printing or a printer like Lulu or Staples.",
      },
      {
        heading: "Handwritten cards and new links, printed the same way",
        proof: "card",
        body:
          "Handwritten cards are rarely the whole collection: there's the link a cousin sent, the screenshot from a group chat, the one someone told you over the phone. All of it comes out in the same layout at the same size, so a collection built from four sources still reads as one collection.",
      },
    ],
    faqs: [
      {
        question: "How is RecipePrinter different from ReciScan?",
        emphasize: false,
        answer:
          "ReciScan is a phone app that scans cards and ships you a bound book. RecipePrinter is a web page that prints cards and pages on your own printer, and exports a cookbook file when you want one.",
      },
      {
        question: "Can RecipePrinter help preserve family recipes?",
        emphasize: "Yes. Upload a photo of the card",
        answer:
          "Yes. Upload a photo of the card and RecipePrinter gives you a printable copy to cook from, share, or add to a family collection.",
      },
      {
        question: "Do I need an app to scan the cards?",
        answer:
          "No. RecipePrinter runs in your browser, so there's nothing to download. Take a photo of the card on a phone, or upload a scan from a computer, and print from whichever device you like.",
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
