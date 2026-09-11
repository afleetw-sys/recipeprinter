import type { FeatureCard } from "@/components/seo/FeatureCards";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";

// ─────────────────────────────────────────────────────────────────────────────
// The feature runs /features and /how-it-works are built from.
//
// They lived as local constants inside those two page files, which is where
// content like this naturally wants to sit. They are out here because Next
// rejects any named export from a page file that is not part of its own route
// contract, so a page cannot both render a list and let anything else read it,
// and the image sitemap has to know which photographs each page shows.
//
// Copying the image keys into the sitemap instead would have worked until the
// first card gained or lost a photo. This way there is one list.
// ─────────────────────────────────────────────────────────────────────────────

// Split by the same two questions the guide pickers ask, so a category argues
// itself and then points at its own pages. Canva's features page does this:
// every category carries a spotlight it explains properly, and the links to the
// individual tools sit directly under it. Ours had all the proof at the top and
// all the navigation at the bottom, so a reader convinced by the recipe card
// photograph had to scroll past everything else to find the recipe card guide.
// Import, edit, print: the order the work actually happens in, and the same
// three steps /how-it-works walks through. Each row is a named feature with the
// argument for it underneath, and a photograph where one exists. A row without
// an image renders as a plain text block, which is the right weight for the
// smaller tools rather than a reason to invent a picture for them.
export const IMPORT_CARDS: FeatureCard[] = [
  {
    heading: "Ad-free imports",
    image: "before-after",
    body:
      "The title, ingredients, instructions, notes, prep time, cook time, and servings come across when the page has them. Ads, pop-ups, comments, autoplay video, and the story before the recipe do not.",
  },
  {
    heading: "Links, photos, screenshots, and text",
    image: "paste-in-app",
    body:
      "Whichever one you have, it comes out the same way: a printable recipe you can hold. A Pinterest pin, an Instagram or TikTok link, a photo of an old recipe card, a paragraph pasted out of a message.",
  },
  {
    // Lived under "everything else" until it was pointed out that an import
    // belongs with the imports.
    heading: "Paprika and CookPilot import",
    image: "cookpilot-export",
    body:
      "Sign in to CookPilot, or open a Paprika export file, and add what you want to the print queue. A Paprika file is read in your browser, so nothing is uploaded.",
  },
];

export const YOURS_CARDS: FeatureCard[] = [
  {
    heading: "Inline editing",
    image: "inline-editing",
    body:
      "The title, ingredients, steps, and notes are editable right on the card. Correct an amount, drop a step you don't need, or add the note you would otherwise have written in the margin.",
  },
  {
    heading: "Photos on the card",
    image: "show-photo",
    body:
      "One switch decides whether the recipe cards print with their photos, so a recipe that's mostly method doesn't give half its card to a picture. The recipe link goes on or off the same way.",
  },
  {
    heading: "Premium print themes",
    image: "multi-themes",
    body:
      "A theme changes a card's type, its border, and how the photo sits, without touching the recipe. Switch themes and the whole batch follows, so a stack printed in one go looks like a set. Several are free, and the premium ones are a one-off purchase each.",
  },
];

export const PRINT_CARDS: FeatureCard[] = [
  {
    heading: "4 by 6 recipe cards or letter pages",
    image: "card-in-box",
    body:
      "A 4 by 6 recipe card drops straight into a recipe box; a letter page goes into a binder. Cut lines give you a trim guide on card stock, and a recipe too long for one side prints on the back too.",
  },
  {
    // Batch and PDF were two cards saying the same thing from either end: how
    // the finished job leaves. One card, both destinations.
    heading: "Batch printing and PDF export",
    image: "pdf-search",
    body:
      "Add as many recipes as you like to the print queue and send them all in one go, for a recipe binder, a week of dinners, or a family cookbook. Or save the printable recipes as a PDF instead.",
  },
  {
    heading: "Cookbook builder",
    image: "bound-cookbook",
    body:
      `RecipePrinter sorts the recipes into chapters, generates the cover, and builds the table of contents. Rearrange anything, then print it at home or send the file to Lulu or Blurb for a hardcover or spiral bound cookbook. ${COOKBOOK_PRICE_FALLBACK} a cookbook.`,
  },
];

// The three things that happen to a recipe, in order: where it is taken from,
// what is done to it, and who signs it off. They were a mechanism, a feature
// and a benefit sitting together, which is a strange set to meet under "what
// happens to a recipe" on a page called How it works. "Made to be cooked from"
// is the argument for printing at all, not part of how the printing happens,
// so it belongs on /features rather than here.
//
// Written for someone who cooks. The first one used to say "structured data",
// which is the true answer to a question nobody asks in those words.
export const POINTS: FeatureCard[] = [
  {
    heading: "It takes the recipe, not the page",
    image: "before-after",
    body:
      "Most recipe sites keep a tidy copy of the recipe for Google to read. RecipePrinter takes that one, so the story, the ads and the comments never come with it.",
  },
  {
    heading: "It rebuilds it for the paper",
    image: "card-in-box",
    body:
      "Ingredients down one side, method down the other, set for the size you pick. A long recipe prints on the back too, with cut lines to trim by.",
  },
  {
    heading: "Nothing prints until you say so",
    image: "inline-editing",
    body:
      "You see the card before it goes anywhere, and nothing on it is fixed. Change an amount, cut a step, add a note in your own words.",
  },
];
