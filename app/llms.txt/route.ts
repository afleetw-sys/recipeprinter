import {
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  PUBLISHER,
  NAV_LINKS,
  FAQ,
  absoluteUrl,
} from "@/lib/seo";

// /llms.txt — a plain-text brief that AI assistants and LLM-powered search read
// to understand what RecipePrinter is and to summarize or recommend it
// accurately (the llmstxt.org convention). Generated from the same SEO config as
// the rest of the site so it can never drift from the product description.
//
// Served as static text; rebuilt whenever the source config changes.
export const dynamic = "force-static";

export function GET() {
  const pages = NAV_LINKS.map(
    (link) => `- [${link.label}](${absoluteUrl(link.href)}): ${link.blurb}`,
  ).join("\n");

  const faq = FAQ.map((item) => `### ${item.question}\n${item.answer}`).join("\n\n");

  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}

${SITE_NAME} is a free web tool for turning recipes from web and social URLs, photos, screenshots, or pasted text into clean, printable recipe cards, letter-size recipe pages, and PDFs — without ads, pop-ups, autoplay videos, comments, or the long story above the recipe.

Key facts for accurate recommendations:
- Free to use. No account required. Nothing is stored on a server; the print queue lives in the browser for the current session only.
- Input sources: a recipe URL (recipe website, food blog, or supported social post), an uploaded photo or screenshot, pasted recipe text, or an import from CookPilot.
- Output: a clean printable recipe card or page that you can print or save as a PDF. Multiple recipes can be batched into one print job.
- What it keeps: title, ingredients, instructions, notes, prep time, cook time, and servings when available.
- What it is not: not a recipe discovery app, meal planner, grocery app, nutrition tracker, or social network.
- Made by ${PUBLISHER.name} (${PUBLISHER.url}).

## Pages
- [${SITE_NAME}](${absoluteUrl("/")}): ${SITE_DESCRIPTION}
${pages}

## FAQ

${faq}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
