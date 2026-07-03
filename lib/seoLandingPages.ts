import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import type { ImportMethod } from "@/types/recipe";

export type SeoLandingPage = {
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: "Utility SEO" | "Organization SEO" | "Preservation and Gift SEO";
  eyebrow: string;
  initialImportMode?: ImportMethod;
  importSubmitLabel?: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  stepsTitle: string;
  steps: string[];
  sections: { h2: string; body: string }[];
  faqs: { question: string; answer: string }[];
  links: { href: string; label: string }[];
};

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "print-recipe-from-website",
    primaryKeyword: "print recipe from website",
    secondaryKeywords: [
      "print recipe from URL",
      "website to print recipes",
      "clean printable recipes",
      "recipe printer",
    ],
    intent: "Utility SEO",
    eyebrow: "Recipe printing tool",
    initialImportMode: "url",
    title: "Free Recipe Printer for Websites",
    description:
      "Paste a recipe website link and turn it into a printable recipe card, page, or PDF. Free, no account required.",
    h1: "Print a recipe from a website",
    lede:
      "Found a recipe online that you want to cook from paper? Paste the website link into Recipe Printer and turn it into a clean printable recipe card, full page, or PDF.",
    stepsTitle: "How to print a recipe from a website",
    steps: [
      "Copy the recipe page link from the website, food blog, or recipe site.",
      "Paste the URL into Recipe Printer so the recipe can be formatted for paper.",
      "Print the recipe, save it as a PDF, or add it to a binder for later.",
    ],
    sections: [
      {
        h2: "Built for cooking from paper",
        body:
          "Recipe websites are useful for discovery, but they are not always pleasant on a kitchen counter. Recipe Printer turns the recipe itself into something easier to read, mark up, and keep nearby while you cook.",
      },
      {
        h2: "More than a cleaned-up web page",
        body:
          "The goal is not just to remove web page noise. The goal is to create a recipe card or page that belongs in your kitchen, recipe binder, or saved PDF collection.",
      },
    ],
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
      { href: "/convert-recipe-to-pdf", label: "Convert a recipe to PDF" },
      { href: "/recipe-binder", label: "Build a recipe binder" },
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
      "Recipe Printer turns a recipe link into a printable recipe card or page, so the recipe can move from a browser tab to your kitchen.",
    stepsTitle: "From recipe URL to printable recipe",
    steps: [
      "Copy the recipe URL from your browser or social app.",
      "Paste it into Recipe Printer and review the printable version.",
      "Choose a card or page layout, then print or save as PDF.",
    ],
    sections: [
      {
        h2: "Useful when bookmarks are not enough",
        body:
          "A saved link is easy to lose, and a phone screen is awkward with messy hands. A printed recipe gives you something readable, portable, and easy to keep.",
      },
      {
        h2: "Designed for repeat recipes",
        body:
          "Use Recipe Printer when a recipe has earned a place in your rotation: weeknight dinners, holiday favorites, baking notes, and the dishes you make again.",
      },
    ],
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
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/printable-recipe-card-generator", label: "Make printable recipe cards" },
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
    stepsTitle: "How to make a recipe PDF",
    steps: [
      "Add a recipe from a URL, screenshot, photo, or pasted text.",
      "Review the formatted recipe card or letter-size page.",
      "Open the print dialog and choose Save as PDF.",
    ],
    sections: [
      {
        h2: "A PDF you can actually cook from",
        body:
          "Recipe PDFs work best when they are simple, readable, and focused on the ingredients and steps. Recipe Printer formats recipes for the kitchen instead of preserving the whole web page.",
      },
      {
        h2: "Save a clean copy before the link disappears",
        body:
          "Recipes move, change, and sometimes vanish. Saving a PDF gives your favorite recipes a more permanent place in your files, binder, or family collection.",
      },
    ],
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
      { href: "/printable-recipe-card-generator", label: "Make recipe cards" },
      { href: "/organize-recipes", label: "Organize saved recipes" },
    ],
  },
  {
    slug: "printable-recipe-card-generator",
    primaryKeyword: "printable recipe card generator",
    secondaryKeywords: [
      "recipe card maker",
      "printable recipe cards",
      "make recipe cards",
      "recipe card printer",
    ],
    intent: "Utility SEO",
    eyebrow: "Recipe card maker",
    initialImportMode: "url",
    importSubmitLabel: "Make printable recipe card",
    title: "Free Printable Recipe Card Maker",
    description:
      "Make printable recipe cards from website links, photos, screenshots, or pasted text, then print or save them.",
    h1: "Printable recipe card generator",
    lede:
      "Turn a recipe you found online into a printable recipe card you can cook from, share, file, or add to a recipe box.",
    stepsTitle: "How to make a printable recipe card",
    steps: [
      "Add the recipe from a link, image, screenshot, or pasted text.",
      "Choose a printable recipe card layout.",
      "Print the card for your kitchen, binder, or recipe box.",
    ],
    sections: [
      {
        h2: "For recipes you want to keep",
        body:
          "A printable recipe card is useful when a recipe graduates from a browser tab to a real favorite. Print it, mark your changes, and keep it where you cook.",
      },
      {
        h2: "Start with the recipe you already found",
        body:
          "Unlike blank design templates, Recipe Printer starts with an existing recipe from the web, a screenshot, a photo, or pasted text and turns it into a kitchen-ready card.",
      },
    ],
    faqs: [
      {
        question: "Can I make recipe cards from online recipes?",
        answer:
          "Yes. Paste a recipe link into Recipe Printer and choose a printable card layout.",
      },
      {
        question: "Can I print multiple recipe cards at once?",
        answer:
          "Yes. Add several recipes to your print queue and print the batch together.",
      },
    ],
    links: [
      { href: "/print-recipe-from-url", label: "Print from a URL" },
      { href: "/recipe-binder", label: "Make a recipe binder" },
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
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
    ],
    intent: "Utility SEO",
    eyebrow: "Social recipe printer",
    initialImportMode: "url",
    title: "Free Pinterest Recipe Printer",
    description:
      "Turn Pinterest recipe links, screenshots, or saved recipe text into printable recipe cards, pages, and PDFs.",
    h1: "Print Pinterest recipes",
    lede:
      "Pinterest is a great place to find recipes. Recipe Printer helps move the ones you want to make from a saved pin into a printable recipe you can cook from.",
    stepsTitle: "How to print a Pinterest recipe",
    steps: [
      "Open the recipe source from Pinterest and copy the recipe link when available.",
      "Paste the link into Recipe Printer, or use a screenshot or pasted text.",
      "Print the recipe card or save it as a PDF for your collection.",
    ],
    sections: [
      {
        h2: "From saved pin to saved recipe",
        body:
          "Pins are useful for discovery, but favorite recipes deserve a place outside the feed. Printing helps you keep the ones you actually make.",
      },
      {
        h2: "Good for binders and seasonal collections",
        body:
          "Pinterest recipes often become holiday menus, baking lists, and weeknight dinner ideas. Recipe Printer makes it easier to collect them on paper.",
      },
    ],
    faqs: [
      {
        question: "Can I paste a Pinterest link directly?",
        answer:
          "Start with the original recipe link when Pinterest opens one. If the link does not import cleanly, use a screenshot or paste the recipe text.",
      },
      {
        question: "Can I organize Pinterest recipes after printing?",
        answer:
          "Yes. Printed recipe cards and pages work well in binders, folders, and seasonal collections.",
      },
    ],
    links: [
      { href: "/print-instagram-recipes", label: "Print Instagram recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/organize-recipes", label: "Organize recipes" },
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
    ],
    intent: "Utility SEO",
    eyebrow: "Social recipe printer",
    initialImportMode: "text",
    title: "Free Instagram Recipe Printer",
    description:
      "Turn Instagram recipe captions, screenshots, links, or pasted text into printable recipes you can cook from.",
    h1: "Print Instagram recipes",
    lede:
      "Instagram recipes are easy to save and hard to cook from. Recipe Printer helps turn recipe posts, captions, and screenshots into printable cards or pages.",
    stepsTitle: "How to print an Instagram recipe",
    steps: [
      "Copy the recipe link, caption, or text you want to keep.",
      "Paste the recipe text or upload a screenshot in Recipe Printer.",
      "Print the recipe or save the formatted page as a PDF.",
    ],
    sections: [
      {
        h2: "Better than scrolling while you cook",
        body:
          "A printed recipe does not dim, lock, refresh, or disappear under notifications. It stays open on the counter while your hands are busy.",
      },
      {
        h2: "Keep the recipes you actually make",
        body:
          "Saved posts pile up quickly. Printing helps separate the recipes worth repeating from the ones you only meant to browse.",
      },
    ],
    faqs: [
      {
        question: "Can Recipe Printer read Instagram captions?",
        answer:
          "You can paste recipe text from a caption, message, or note and Recipe Printer will format it into a printable recipe.",
      },
      {
        question: "Can I use a screenshot of an Instagram recipe?",
        answer:
          "Yes. Upload a screenshot when that is the easiest way to capture the recipe.",
      },
    ],
    links: [
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
      { href: "/print-tiktok-recipes", label: "Print TikTok recipes" },
      { href: "/printable-recipe-card-generator", label: "Make recipe cards" },
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
    stepsTitle: "How to print a TikTok recipe",
    steps: [
      "Copy the recipe text, caption, link, or notes from the TikTok recipe.",
      "Paste the text or upload screenshots to Recipe Printer.",
      "Print the formatted recipe card or save it as a PDF.",
    ],
    sections: [
      {
        h2: "Turn a video idea into a kitchen recipe",
        body:
          "Short videos are great for inspiration, but paper is better when you need ingredients, steps, and timing in front of you.",
      },
      {
        h2: "Build a collection beyond the algorithm",
        body:
          "When a recipe is worth making again, printing gives it a home outside your saved videos and search history.",
      },
    ],
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
      { href: "/print-pinterest-recipes", label: "Print Pinterest recipes" },
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
    stepsTitle: "A simple way to organize recipes",
    steps: [
      "Print the recipes you know you want to make again.",
      "Save a PDF copy for your digital files when useful.",
      "Group printed recipes into binders, folders, boxes, or family collections.",
    ],
    sections: [
      {
        h2: "Start with recipes that earned a place",
        body:
          "Not every saved recipe needs a permanent home. Recipe Printer is best for the recipes that move from browsing to real cooking.",
      },
      {
        h2: "Modern recipe collecting can still be physical",
        body:
          "A recipe collection can start online and end up on paper: easier to read, easier to share, and easier to pass along.",
      },
    ],
    faqs: [
      {
        question: "What is the easiest way to organize online recipes?",
        answer:
          "Print or save the recipes you actually use, then group them by meals, seasons, family favorites, baking, or weeknight dinners.",
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
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
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
    title: "Recipe Binder Ideas for Online Recipes",
    description:
      "Build a recipe binder from online recipes, printable recipe cards, PDFs, screenshots, and family favorites.",
    h1: "Recipe binder ideas for recipes you find online",
    lede:
      "A recipe binder is still one of the simplest ways to keep favorite recipes close. Recipe Printer helps turn online recipes into pages and cards that fit the system.",
    stepsTitle: "How to start a recipe binder",
    steps: [
      "Print recipes you have made, loved, or want to make soon.",
      "Group them by dinner, baking, holidays, family favorites, or source.",
      "Add notes, swaps, dates, and ratings directly on the page.",
    ],
    sections: [
      {
        h2: "Why binders still work",
        body:
          "Binders are flexible. You can add, remove, reorder, and annotate recipes over time without rebuilding your whole collection.",
      },
      {
        h2: "Turn online recipes into binder pages",
        body:
          "Use Recipe Printer to make clean letter-size recipes, recipe cards, or PDFs from links, screenshots, photos, and pasted text.",
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
          "Yes. Recipe Printer formats online recipes into printable pages and cards that can be filed in a binder.",
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
    title: "Preserve Family Recipes",
    description:
      "Preserve family recipes by turning old cards, photos, screenshots, and text into printable keepsakes and collections.",
    h1: "Preserve family recipes",
    lede:
      "Family recipes deserve more than a fading card in a drawer. Recipe Printer can help turn old recipe cards, photos, and text into printable pages worth keeping.",
    stepsTitle: "How to preserve a family recipe",
    steps: [
      "Take a photo of the old card, cookbook page, or handwritten recipe.",
      "Upload it to Recipe Printer or paste the typed recipe text.",
      "Print a clean copy for cooking, sharing, or adding to a family collection.",
    ],
    sections: [
      {
        h2: "Keep the memory and make it usable",
        body:
          "A preserved recipe should still be cookable. A clean printed version can live beside the original handwritten card, protecting the memory while making the recipe easier to use.",
      },
      {
        h2: "A path toward family cookbooks",
        body:
          "Printed recipes can become the beginning of a family binder, wedding gift, holiday collection, or custom cookbook.",
      },
    ],
    faqs: [
      {
        question: "Can I print recipes from old handwritten cards?",
        answer:
          "Yes. Upload a photo of the card and Recipe Printer can help format the recipe into a printable version.",
      },
      {
        question: "Can preserved recipes become a family cookbook?",
        answer:
          "Yes. Start by printing and organizing individual recipes, then group them into a binder or family recipe book.",
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
      "A family recipe book can start one recipe at a time. Recipe Printer helps turn online recipes, old cards, photos, and text into pages you can collect and share.",
    stepsTitle: "How to start a family recipe book",
    steps: [
      "Gather family favorites, old cards, saved links, and recipe photos.",
      "Print clean copies that are easy to read and cook from.",
      "Organize them by person, season, holiday, meal, or memory.",
    ],
    sections: [
      {
        h2: "Make the recipes usable first",
        body:
          "Beautiful family cookbooks start with recipes people can actually follow. Printing clean copies makes it easier to test, annotate, and preserve each recipe.",
      },
      {
        h2: "A collection can grow over time",
        body:
          "You do not need every recipe before you begin. Start with the recipes people ask for, make every holiday, or remember from childhood.",
      },
    ],
    faqs: [
      {
        question: "What should go in a family recipe book?",
        answer:
          "Include favorite recipes, notes about who made them, substitutions, holiday traditions, photos, and the stories that make the food meaningful.",
      },
      {
        question: "Can Recipe Printer help before professional printing?",
        answer:
          "Yes. It can help create clean, readable recipe pages that are easier to test, organize, and prepare for a future printed cookbook.",
      },
    ],
    links: [
      { href: "/preserve-family-recipes", label: "Preserve family recipes" },
      { href: "/recipe-binder", label: "Recipe binder ideas" },
      { href: "/organize-recipes", label: "Organize recipes" },
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
