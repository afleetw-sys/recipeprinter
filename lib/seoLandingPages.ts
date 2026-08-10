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

/** Hub a page sits under (present → 3-level breadcrumb). Kept in `SEO_HUBS`. */
export type SeoHubKey = "social-recipes" | "family-cookbooks";

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
  /** Optional hub this page belongs to; drives the 3-level breadcrumb. */
  hub?: SeoHubKey;
  /** Loose grouping for the related cluster even when there's no hub page. */
  group?: string;
  eyebrow: string;
  statusNote?: string;
  initialImportMode?: ImportMethod;
  importSubmitLabel?: string;
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
  /** 3–4 icon + label reassurances shown under the hero. */
  valueProps?: { icon: SeoIconKey; label: string }[];
  /** "How to …" steps, renders the section and the HowTo JSON-LD. */
  howTo?: { name: string; text: string }[];
  /** 2–3 deep-dive sections, each targeting a secondary keyword, with a proof visual. */
  featureSections?: { heading: string; body: string; proof?: SeoProofKind }[];
  /** Real printed-card photo keys (PRINTED_CARDS) for the examples gallery. */
  examples?: string[];
  /** A single real testimonial; only rendered when present. */
  testimonial?: { quote: string; attribution: string };
  faqs: { question: string; answer: string }[];
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
    eyebrow: "Recipe printing tool",
    initialImportMode: "url",
    title: "Print a Recipe from Any Website",
    description:
      "Paste a recipe website or food blog link and turn it into a clean printable recipe card, page, or PDF.",
    h1: "Print a recipe from a website",
    lede:
      "Found a recipe on a food blog or recipe website that you want to cook from paper? Paste the page link into Recipe Printer and turn the recipe itself into a clean printable card, full page, or PDF.",
    howTo: [
      {
        name: "Copy the recipe link",
        text: "On the food blog or recipe site, copy the page link from your browser's address bar or the app's share button.",
      },
      {
        name: "Paste it in and start",
        text: "Paste the link into the box above and start it. Recipe Printer reads the page and rebuilds the recipe as a clean, printable layout.",
      },
      {
        name: "Set the format",
        text: "Choose a recipe card or a full page, keep or drop the photo, and fix anything the site formatted oddly before you print.",
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
          "Recipe Printer reads the page and keeps only what you cook from: the ingredient list with amounts, the numbered steps, the prep and cook times, and the servings. The blogger's backstory, the autoplay video, the comments, and the ads stay behind. When the site names a source or author, that can print alongside the recipe so you know where it came from and can find it again.",
      },
      {
        heading: "Print it the way your kitchen actually works",
        proof: "card",
        body:
          "Pick the format that fits how you cook. A 4 by 6 card drops straight into a recipe box or an index-card binder. A full letter page suits long bakes and doubled batches, with room in the margin for your own notes. Keep the finished-dish photo or leave it off to save ink, and the type stays large enough to read from across the counter.",
      },
      {
        heading: "For the pages that fight back",
        proof: "steps",
        body:
          "Some recipes hide behind a login, sit on a site that blocks importers, or live only in a video's description. When a link won't import cleanly, paste the recipe text straight in or upload a screenshot, and Recipe Printer structures it into the same clean printout. It works from a phone too, so you can grab a recipe on the couch and print it from the kitchen later.",
      },
    ],
    examples: ["caprese", "korean", "pesto"],
    faqs: [
      {
        question: "Can I print more than one recipe at once?",
        answer:
          "Yes. Add several recipes and print them together, which helps when you're prepping a week of dinners or building a section for a binder.",
      },
      {
        question: "Can I save the recipe as a PDF instead of printing?",
        answer:
          "Yes. Recipe Printer builds a print-ready page, so in the print dialog you can choose Save as PDF and keep a clean copy on your phone or computer to print whenever you want.",
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
    eyebrow: "Ad-free recipe printing",
    initialImportMode: "url",
    title: "Print Recipes Without Ads",
    description:
      "Turn cluttered recipe pages into clean printable recipes without ads, pop-ups, comments, or wasted pages.",
    h1: "Print a recipe without ads",
    lede:
      "Recipe pages can be hard to print cleanly. Recipe Printer helps pull out the ingredients, steps, notes, timing, and servings so you can print the recipe without ads, pop-ups, autoplay videos, comments, or extra page clutter.",
    faqs: [
      {
        question: "Can I print a recipe without pictures?",
        answer:
          "Yes. Recipe Printer creates a recipe-first print layout. When a photo is available, you can choose a layout that fits your needs instead of printing every image on the web page.",
      },
      {
        question: "Does Recipe Printer remove ads from recipe printouts?",
        answer:
          "Recipe Printer formats the recipe itself for printing, so ads, pop-ups, comments, navigation, and other page clutter stay out of the printable recipe.",
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
    eyebrow: "Recipe printing tool",
    initialImportMode: "url",
    title: "Free Recipe URL Printer",
    description:
      "Paste a recipe URL and make a printable recipe card, page, or PDF you can cook from and keep. Free, no account required.",
    h1: "Print a recipe from a URL",
    lede:
      "Have the recipe link but not a good print button? Recipe Printer turns a URL from a browser, message, saved note, or social app into a printable recipe card or page.",
    faqs: [
      {
        question: "What kinds of recipe URLs can I use?",
        answer:
          "You can start with recipe websites, food blogs, and supported social links. If a link is blocked or incomplete, paste the recipe text or upload a screenshot.",
      },
      {
        question: "Does Recipe Printer keep the original recipe link?",
        answer:
          "When available, the printed recipe can include source details so you know where the recipe came from.",
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
    eyebrow: "Recipe PDF tool",
    initialImportMode: "url",
    title: "Free Recipe to PDF Converter",
    description:
      "Turn recipes from links, photos, screenshots, or text into printable PDFs for saving, sharing, and cooking.",
    h1: "Convert a recipe to PDF",
    lede:
      "Recipe Printer helps you turn online recipes into print-ready pages that can be saved as PDFs and kept with the rest of your recipe collection.",
    faqs: [
      {
        question: "Can Recipe Printer export a recipe PDF directly?",
        answer:
          "Recipe Printer creates a print-ready recipe. To save it as a PDF, choose Save as PDF in your browser print dialog.",
      },
      {
        question: "Can I make PDFs from screenshots or photos?",
        answer:
          "Yes. Upload a screenshot, cookbook page, old recipe card, or saved image, then print or save the formatted result as a PDF.",
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
    eyebrow: "Recipe card maker",
    initialImportMode: "url",
    importSubmitLabel: "Make printable recipe card",
    title: "Free Printable Recipe Card Maker",
    description:
      "Make printable recipe cards from links, photos, screenshots, or text, including 4x6 and recipe-box-friendly layouts.",
    h1: "Printable recipe card generator",
    lede:
      "Turn a recipe you found online into a printable recipe card you can cook from, share, file, or add to a recipe box. This page is focused on card layouts, recipe boxes, and small-format printouts rather than full-page recipes. Rather than build a card from a blank template, you start from a real recipe and choose the layout, so the design work is already done.",
    faqs: [
      {
        question: "Can I make 4x6 recipe cards from online recipes?",
        answer:
          "Yes. Paste a recipe link into Recipe Printer and choose a printable card layout, including card-style formats that work well for 4x6 recipe cards.",
      },
      {
        question: "Can I print multiple recipe cards at once?",
        answer:
          "Yes. Add several recipes to your print queue and print the batch together.",
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
    eyebrow: "Social recipe printer",
    initialImportMode: "url",
    importHint:
      "No clean recipe link on the pin? Paste the recipe text or upload a screenshot instead.",
    title: "Free Pinterest Recipe Printer",
    description:
      "Turn Pinterest recipe links, screenshots, or saved recipe text into printable recipe cards, pages, and PDFs.",
    h1: "Print Pinterest recipes",
    lede:
      "Pinterest is a great place to find recipes. Recipe Printer helps move the ones you want to make from a saved pin into a printable recipe you can cook from.",
    faqs: [
      {
        question: "How do I print Pinterest recipes from an iPhone?",
        answer:
          "Open the pin, use the original recipe link when Pinterest provides one, then paste that link into Recipe Printer. If the recipe is only visible in the pin or app, use a screenshot or paste the recipe text.",
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
    initialImportMode: "text",
    title: "Free Instagram Recipe Printer",
    description:
      "Turn Instagram recipe captions, screenshots, links, or pasted text into printable recipes you can cook from.",
    h1: "Print Instagram recipes",
    lede:
      "Instagram recipes and Reels are easy to save and hard to cook from. Recipe Printer helps turn recipe captions, screenshots, links, and pasted text into printable cards or pages.",
    faqs: [
      {
        question: "Can I print a recipe from an Instagram Reel?",
        answer:
          "Yes. Copy the Reel caption, notes, or source link when available, or upload screenshots of the recipe text. Recipe Printer will format the recipe into a printable card or page.",
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
    initialImportMode: "text",
    title: "Free Facebook Recipe Printer",
    description:
      "Turn Facebook recipe posts, Reels, screenshots, links, or copied text into printable recipe cards, pages, and PDFs.",
    h1: "Print recipes from Facebook",
    lede:
      "Facebook recipes often show up in posts, group comments, Reels, captions, screenshots, and shared links. Recipe Printer helps turn the parts you can copy or capture into a printable recipe you can cook from.",
    faqs: [
      {
        question: "Can I print recipes from Facebook Reels?",
        answer:
          "Yes. Use the recipe text, caption, screenshots, or source link when available. Recipe Printer can format copied text or screenshots into a printable recipe card or page.",
      },
      {
        question: "What if Facebook will not let me copy the recipe?",
        answer:
          "Take screenshots of the recipe text or copy the source link if the creator included one. Recipe Printer can start from screenshots, photos, pasted text, or URLs.",
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
    initialImportMode: "text",
    title: "Free TikTok Recipe Printer",
    description:
      "Turn TikTok recipe captions, screenshots, links, or pasted text into printable recipe cards, pages, and PDFs.",
    h1: "Print TikTok recipes",
    lede:
      "TikTok is good for finding quick recipe ideas. Recipe Printer helps turn the recipes you want to repeat into something stable enough to cook from.",
    faqs: [
      {
        question: "Can Recipe Printer print directly from TikTok?",
        answer:
          "Use the recipe text, caption, screenshots, or available source link. Recipe Printer will format the recipe into a printable card or page.",
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
    initialImportMode: "text",
    title: "Free YouTube Recipe Printer",
    description:
      "Turn YouTube recipe descriptions, transcripts, screenshots, links, or copied notes into printable recipes.",
    h1: "Print a recipe from YouTube",
    lede:
      "YouTube recipes are helpful to watch and frustrating to cook from when the ingredients live in a description, transcript, pinned comment, or on-screen text. Recipe Printer helps turn the recipe details into a printable card or page.",
    faqs: [
      {
        question: "Can Recipe Printer extract a full recipe from any YouTube video?",
        answer:
          "Start with the written recipe details when they are available: the description, transcript, pinned comment, screenshots, or source link. If the video has no usable recipe text, you may need to paste your own notes.",
      },
      {
        question: "Can I save a YouTube recipe as a PDF?",
        answer:
          "Yes. Once the recipe details are formatted in Recipe Printer, choose Save as PDF in your browser print dialog.",
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
    eyebrow: "Recipe organization guide",
    title: "Organize Recipes from the Internet",
    description:
      "Turn scattered online recipes into printable cards, PDFs, binders, and collections you can cook from and keep.",
    h1: "Organize recipes from the internet",
    lede:
      "Recipe Printer helps turn scattered links, screenshots, saved posts, and copied text into a recipe collection you can cook from and keep.",
    faqs: [
      {
        question: "What is the easiest way to organize online recipes?",
        answer:
          "Start by printing or saving the recipes you actually cook, then group them by meals, seasons, family favorites, baking, holidays, or weeknight dinners.",
      },
      {
        question: "Can Recipe Printer help with recipe binders?",
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
      "Coming soon: dedicated binder-building features. For now, Recipe Printer helps you create the printable pages, cards, and PDFs that can go into a binder.",
    title: "Recipe Binder Ideas for Online Recipes",
    description:
      "Build a recipe binder from online recipes, printable recipe cards, PDFs, screenshots, and family favorites.",
    h1: "Recipe binder ideas for recipes you find online",
    lede:
      "A recipe binder is still one of the simplest ways to keep favorite recipes close. Recipe Printer helps turn online recipes into printable pages, cards, and PDFs you can file now, with more binder-specific tools coming soon.",
    faqs: [
      {
        question: "Should a recipe binder use cards or full pages?",
        answer:
          "Both can work. Full pages are easiest for long recipes, while cards are nice for short favorites, baking, and gifts.",
      },
      {
        question: "Can I make a binder from recipes I found online?",
        answer:
          "Yes. Recipe Printer formats online recipes into printable pages and cards that can be filed in a physical binder. A dedicated binder-building workflow is planned.",
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
    eyebrow: "Family recipe guide",
    statusNote:
      "Turn old cards, photos, screenshots, and pasted text into clean recipe pages, then gather them into a keepsake cookbook with a cover, an automatic table of contents, and chapters.",
    title: "Preserve Family Recipes",
    description:
      "Preserve family recipes by turning old cards, photos, screenshots, and text into printable keepsakes and a bound family cookbook.",
    h1: "Preserve family recipes",
    lede:
      "Family recipes deserve more than a fading card in a drawer. Recipe Printer turns old recipe cards, photos, and text into printable pages worth keeping, then gathers them into a keepsake family cookbook.",
    faqs: [
      {
        question: "Can I print recipes from old handwritten cards?",
        answer:
          "Yes. Upload a photo of the card and Recipe Printer can help format the recipe into a printable version.",
      },
      {
        question: "Can preserved recipes become a family cookbook?",
        answer:
          "Yes. Group them into chapters, add a cover and an automatic table of contents, and print the finished cookbook at home or through a professional printer.",
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
      "A family recipe book can start with one recipe. Recipe Printer turns online recipes, old cards, photos, and typed-in notes into clean, matching pages, then binds them into a cookbook with a cover, chapters, and a table of contents.",
    captureReassurance: false,
    importHint: "Start here, then add as many recipes as you like.",
    howTo: [
      {
        name: "Gather the recipes",
        text: "Bring together the recipes you want to keep: paste links, photograph old handwritten cards, upload screenshots, or type in the ones that only live in someone's head.",
      },
      {
        name: "Clean up each page",
        text: "Recipe Printer sets every recipe on a clear, consistent page, so a faded card and a copied text end up looking like they belong in the same book.",
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
          "Family recipes arrive in every format: a stained index card, a screenshot from a group chat, a link a cousin sent, a method that only lives in someone's head. Recipe Printer reads each one and sets it on a clean, consistent page, so a card from 1975 and a text from last week look like they belong in the same book instead of a pile of mismatched scraps.",
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
    examples: ["pesto", "caprese", "korean"],
    faqs: [
      {
        question: "What should go in a family recipe book?",
        answer:
          "Include the recipes people actually ask for, notes on who made them and when, substitutions and tips, holiday traditions, and photos. The small stories are what turn a stack of recipes into a book worth keeping.",
      },
      {
        question: "Can I add recipes to the book over time?",
        answer:
          "Yes. You don't have to finish it in one sitting. Add recipes as you collect them, and the table of contents renumbers itself so the book stays in order as it grows.",
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
    eyebrow: "Recipe tool alternative",
    initialImportMode: "url",
    title: "Just the Recipe Alternative",
    description:
      "Looking for a Just the Recipe alternative? Recipe Printer turns online recipes into printable cards, pages, and PDFs worth keeping.",
    h1: "A Just the Recipe alternative for printable recipes",
    lede:
      "Recipe Printer is for cooks who want a clean recipe plus a real print layout. Paste a recipe link and turn it into a printable card, page, or PDF for your kitchen.",
    faqs: [
      {
        question: "How is Recipe Printer different from Just the Recipe?",
        answer:
          "Recipe Printer focuses on turning recipes from links, photos, screenshots, and text into printable recipe cards, pages, and PDFs for cooking, saving, and collecting.",
      },
      {
        question: "Can Recipe Printer print recipes without page clutter?",
        answer:
          "Yes. Recipe Printer formats the recipe itself for paper, so ads, pop-ups, comments, and extra web page clutter stay off the printed recipe.",
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
    eyebrow: "Recipe preservation alternative",
    title: "ReciScan Alternative",
    description:
      "Looking for a ReciScan alternative? Recipe Printer turns links, screenshots, photos, and text into printable recipe pages and cards.",
    h1: "A ReciScan alternative for printable recipe collections",
    lede:
      "Recipe Printer helps you turn recipes from the internet, old cards, screenshots, and text into printable pages, cards, and PDFs you can cook from and keep.",
    faqs: [
      {
        question: "How is Recipe Printer different from ReciScan?",
        answer:
          "Recipe Printer is a web-based recipe printing tool focused on turning recipe links, screenshots, photos, and pasted text into printable cards, pages, and PDFs.",
      },
      {
        question: "Can Recipe Printer help preserve family recipes?",
        answer:
          "Yes. You can upload a photo of an old recipe card or paste recipe text, then print a clean copy for cooking, sharing, or adding to a family collection.",
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

export type SeoHub = {
  /** Hub page path segment, e.g. "social-recipes" → /social-recipes. */
  slug: string;
  /** Breadcrumb + hub-page heading label. */
  label: string;
  blurb: string;
  /** Member leaf slugs, in display order. */
  members: string[];
};

/**
 * Only the groups that earn a real hub page live here (see the plan's
 * "hubs only where they earn it"). A leaf page opts in via `hub`; pages without
 * one get a 2-level breadcrumb. Empty until the hub pages are built in Phase 1,
 * the breadcrumb and related cluster read this and fall back to a 2-level trail
 * while a hub is absent.
 */
export const SEO_HUBS: Partial<Record<SeoHubKey, SeoHub>> = {};

/** The resolved hub for a page, or null when it has none (or its hub isn't built yet). */
export function hubForPage(page: SeoLandingPage): SeoHub | null {
  return (page.hub && SEO_HUBS[page.hub]) || null;
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
