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
    stepsTitle: "How to print a recipe from a website",
    steps: [
      "Copy the recipe page link from the website, food blog, or recipe site.",
      "Paste the URL into Recipe Printer so the recipe can be formatted for paper.",
      "Print the recipe, save it as a PDF, or add it to a binder for later.",
    ],
    sections: [
      {
        h2: "For food blogs and recipe sites",
        body:
          "Use this page when the recipe starts on a regular website: a food blog, publisher recipe page, cooking site, or shared article. Recipe Printer focuses on the recipe details you need at the counter instead of the full web page around them.",
      },
      {
        h2: "A better printout than browser print",
        body:
          "Browser print often keeps headers, sidebars, giant photos, comments, and extra pages. Recipe Printer reformats the ingredients and steps as a kitchen-friendly card or page you can mark up and keep.",
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
    stepsTitle: "How to print a recipe without ads",
    steps: [
      "Copy the recipe page URL from the website or food blog.",
      "Paste the link into Recipe Printer and review the cleaned-up recipe.",
      "Print the card or page, or choose Save as PDF for an ad-free copy.",
    ],
    sections: [
      {
        h2: "Skip clutter before it reaches paper",
        body:
          "This page is for the specific frustration of printing an online recipe and getting ads, pop-ups, sidebars, comments, videos, or oversized photos. Recipe Printer is designed to keep the recipe and leave the surrounding web page behind.",
      },
      {
        h2: "Save paper and stay focused",
        body:
          "A clean printable recipe is easier to read while cooking and less likely to become a five-page printout. Use it for weeknight recipes, baking projects, holiday dishes, and anything you want on the counter instead of a phone.",
      },
    ],
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
    stepsTitle: "From recipe URL to printable recipe",
    steps: [
      "Copy the recipe URL from your browser or social app.",
      "Paste it into Recipe Printer and review the printable version.",
      "Choose a card or page layout, then print or save as PDF.",
    ],
    sections: [
      {
        h2: "For links saved anywhere",
        body:
          "Use this page when your starting point is the link itself: a copied URL, a saved tab, a text message, an email, or a source link from a social post. It is intentionally broader than a regular website recipe page.",
      },
      {
        h2: "Keep the source with the printout",
        body:
          "When source details are available, Recipe Printer can keep them with the printable recipe so you know where the recipe came from after it leaves your browser.",
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
        h2: "Archive the version you cooked from",
        body:
          "Recipes move, change, and sometimes vanish. Saving a PDF gives you a stable copy of the version you cooked from, with room to keep it in a digital folder, print it later, or file it beside your paper recipes.",
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
      { href: "/print-recipe-without-ads", label: "Print without ads" },
      { href: "/printable-recipe-card-generator", label: "Make recipe cards" },
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
      "Turn a recipe you found online into a printable recipe card you can cook from, share, file, or add to a recipe box. This page is focused on card layouts, recipe boxes, and small-format printouts rather than full-page recipes.",
    stepsTitle: "How to make a printable recipe card",
    steps: [
      "Add the recipe from a link, image, screenshot, or pasted text.",
      "Choose a printable recipe card layout.",
      "Print the card for your kitchen, binder, or recipe box.",
    ],
    sections: [
      {
        h2: "For 4x6 cards and recipe boxes",
        body:
          "Recipe cards are useful when a recipe graduates from a browser tab to a real favorite. Choose a compact format for recipe boxes, binder pockets, gifts, and the recipes you want close at hand.",
      },
      {
        h2: "Start with the recipe you already found",
        body:
          "Unlike blank design templates, Recipe Printer starts with an existing recipe from the web, a screenshot, a photo, or pasted text and turns it into a kitchen-ready card.",
      },
    ],
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
    stepsTitle: "How to print a Pinterest recipe",
    steps: [
      "Open the recipe source from Pinterest and copy the recipe link when available.",
      "Paste the link into Recipe Printer, or use a screenshot or pasted text.",
      "Print the recipe card or save it as a PDF for your collection.",
    ],
    sections: [
      {
        h2: "From saved pin to source recipe",
        body:
          "Pins are useful for discovery, but the recipe often lives on the linked website, in the pin text, or in a screenshot. Recipe Printer gives you a path from saved pin to printable recipe without relying on the feed.",
      },
      {
        h2: "Good for binders and seasonal collections",
        body:
          "Pinterest recipes often become holiday menus, baking lists, and weeknight dinner ideas. Recipe Printer makes it easier to collect them on paper.",
      },
    ],
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
    stepsTitle: "How to print an Instagram recipe",
    steps: [
      "Copy the recipe link, caption, Reel notes, or text you want to keep.",
      "Paste the recipe text or upload a screenshot in Recipe Printer.",
      "Print the recipe or save the formatted page as a PDF.",
    ],
    sections: [
      {
        h2: "Made for captions and Reels",
        body:
          "Many Instagram recipes live in captions, Reel overlays, screenshots, or creator notes. Paste the text you can copy or upload a screenshot when that is the fastest way to capture the recipe.",
      },
      {
        h2: "Keep the recipes you actually make",
        body:
          "Saved posts pile up quickly. Printing helps separate the recipes worth repeating from the ones you only meant to browse.",
      },
    ],
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
    stepsTitle: "How to print a Facebook recipe",
    steps: [
      "Copy the recipe text, source link, post link, or notes you want to keep.",
      "Paste the recipe text into Recipe Printer, or upload screenshots when copying is awkward.",
      "Review the formatted recipe, then print it or save it as a PDF.",
    ],
    sections: [
      {
        h2: "Useful for posts, groups, and Reels",
        body:
          "Facebook recipes are not always on a normal recipe page. They may be split between a post, comments, video caption, or creator link. Recipe Printer is built around flexible inputs so you can start with text, screenshots, photos, or a URL.",
      },
      {
        h2: "Get the recipe out of the feed",
        body:
          "A printed recipe is easier to cook from than a saved post that moves, refreshes, or disappears under notifications. Print the recipe once it is something you actually want to make.",
      },
    ],
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
    stepsTitle: "How to print a recipe from YouTube",
    steps: [
      "Copy the recipe from the video description, transcript, pinned comment, or source link.",
      "Paste the recipe text into Recipe Printer, or upload screenshots of on-screen ingredients and steps.",
      "Review the printable version, then print it or save it as a PDF.",
    ],
    sections: [
      {
        h2: "For video recipes with written details",
        body:
          "This page is for recipes that start in a YouTube video but need to become a written kitchen reference. Use the description, transcript, comments, screenshots, or linked source recipe when available.",
      },
      {
        h2: "Stop pausing the video to cook",
        body:
          "Videos are great for technique, but paper is better for ingredients, timing, and step order. Print the recipe once you know you want to make it.",
      },
    ],
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
    stepsTitle: "A simple way to organize recipes",
    steps: [
      "Print the recipes you know you want to make again.",
      "Save a PDF copy for your digital files when useful.",
      "Group printed recipes into binders, folders, boxes, or family collections.",
    ],
    sections: [
      {
        h2: "Separate real favorites from saved clutter",
        body:
          "Saved recipes pile up in bookmarks, Pinterest boards, social apps, screenshots, and texts. Recipe Printer helps you move only the recipes you actually use into a format you can print, annotate, and sort.",
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
    stepsTitle: "How to start a recipe binder",
    steps: [
      "Print recipes you have made, loved, or want to make soon.",
      "Group them by dinner, baking, holidays, family favorites, or source.",
      "Add notes, swaps, dates, and ratings directly on the page.",
    ],
    sections: [
      {
        h2: "Binder system coming soon",
        body:
          "Recipe Printer does not yet manage a full binder library inside the product. The current tool is best for creating clean pages and cards you can print, save as PDFs, and organize in your own binder.",
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
        h2: "Preservation tools coming soon",
        body:
          "Recipe Printer is starting with the practical first step: make a clean copy you can cook from and share. More family recipe preservation features are planned for collections, keepsakes, and cookbook preparation.",
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
        h2: "Book planning tools coming soon",
        body:
          "Recipe Printer does not yet lay out a full family cookbook. It helps you prepare the individual recipes first so they are easier to test, annotate, organize, and later turn into a finished book.",
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
    stepsTitle: "How Recipe Printer works",
    steps: [
      "Paste a recipe URL from a website, blog, or supported social post.",
      "Review the printable recipe card or letter-size page.",
      "Print it for your counter, save it as a PDF, or add it to your recipe binder.",
    ],
    sections: [
      {
        h2: "A different job than recipe extraction",
        body:
          "Just-the-recipe tools are often about stripping a web page down on screen. Recipe Printer is built around the next step: making a recipe card, full page, or PDF that belongs on paper.",
      },
      {
        h2: "For recipes worth keeping",
        body:
          "Use Recipe Printer when a recipe has earned a place beyond a browser tab: weeknight favorites, baking notes, family dishes, and recipes you want in a binder.",
      },
    ],
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
    stepsTitle: "Start a printable recipe collection",
    steps: [
      "Add a recipe from a website, screenshot, photo, or pasted text.",
      "Print a clean recipe card or full-page recipe.",
      "Save it in a binder, recipe box, family collection, or future cookbook project.",
    ],
    sections: [
      {
        h2: "A bridge from online recipes to paper",
        body:
          "Recipe Printer is strongest when recipes start online but belong somewhere physical: on your counter, in a binder, or in a family collection.",
      },
      {
        h2: "Useful before a cookbook project",
        body:
          "Before you make a full family cookbook, Recipe Printer can help you print, test, annotate, and organize the individual recipes people actually use.",
      },
    ],
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
