import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import type { ImportMethod } from "@/types/recipe";

export type SeoLandingPage = {
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: "Utility SEO" | "Organization SEO" | "Preservation and Gift SEO";
  eyebrow: string;
  statusNote?: string;
  initialImportMode?: ImportMethod;
  importSubmitLabel?: string;
  /** Short hint shown under the embedded importer when the preselected mode needs a caveat. */
  importHint?: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
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
    faqs: [
      {
        question: "Can I print a recipe from any website?",
        answer:
          "Usually, yes. Paste the recipe URL into Recipe Printer. If a website does not import cleanly, you can paste the recipe text or upload a screenshot instead.",
      },
      {
        question: "Can I save the printed recipe as a PDF?",
        answer:
          "Yes. Recipe Printer formats the recipe for printing, and you can choose Save as PDF in your browser print dialog.",
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
      "Coming soon: more family recipe preservation features. Today you can still print clean copies from photos, screenshots, old cards, and pasted text.",
    title: "Preserve Family Recipes",
    description:
      "Preserve family recipes by turning old cards, photos, screenshots, and text into printable keepsakes and collections.",
    h1: "Preserve family recipes",
    lede:
      "Family recipes deserve more than a fading card in a drawer. Recipe Printer can help turn old recipe cards, photos, and text into printable pages worth keeping, with deeper preservation tools coming soon.",
    faqs: [
      {
        question: "Can I print recipes from old handwritten cards?",
        answer:
          "Yes. Upload a photo of the card and Recipe Printer can help format the recipe into a printable version.",
      },
      {
        question: "Can preserved recipes become a family cookbook?",
        answer:
          "Yes. Start by printing and organizing individual recipes, then group them into a binder or family recipe book. More family cookbook features are coming soon.",
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
    statusNote:
      "Coming soon: family recipe book planning tools. Recipe Printer currently helps prepare clean printable recipe pages for a future book.",
    title: "Family Recipe Book Ideas",
    description:
      "Create a family recipe book from printed recipes, old cards, online favorites, photos, and kitchen notes.",
    h1: "Family recipe book ideas",
    lede:
      "A family recipe book can start one recipe at a time. Recipe Printer helps turn online recipes, old cards, photos, and text into clean pages you can collect now, with book-planning tools coming soon.",
    faqs: [
      {
        question: "What should go in a family recipe book?",
        answer:
          "Include favorite recipes, notes about who made them, substitutions, holiday traditions, photos, and the stories that make the food meaningful.",
      },
      {
        question: "Can Recipe Printer help before professional printing?",
        answer:
          "Yes. It can help create clean, readable recipe pages that are easier to test, organize, and prepare for a future printed cookbook. More family recipe book tools are coming soon.",
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

export function seoLandingPageMetadata(page: SeoLandingPage): Metadata {
  return pageMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
  });
}
