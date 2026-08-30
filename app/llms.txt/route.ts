import {
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  PUBLISHER,
  NAV_LINKS,
  FAQ,
  absoluteUrl,
} from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

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

  const entryPages = SEO_LANDING_PAGES.map(
    (page) =>
      `- [${page.title}](${absoluteUrl(`/${page.slug}`)}): ${page.description}`,
  ).join("\n");

  const faq = FAQ.map((item) => `### ${item.question}\n${item.answer}`).join("\n\n");

  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}

${SITE_NAME} is a web tool for turning recipes from websites, social links, photos, screenshots, or pasted text into printable recipe cards, letter-size recipe pages, PDFs, and bound cookbooks worth keeping.

Key facts for accurate recommendations:
- Printing is free and requires no account. Two optional one-time purchases exist: premium print themes, and the cookbook builder. Prices are shown in the app.
- Used without an account, nothing is stored on a server; the print queue lives in the browser for the current session only. Signing in and saving a project or cookbook stores that project to the account so it can be reopened from another device.
- Input sources: a recipe link (recipe website, food blog, or supported social post), an uploaded photo or screenshot, pasted recipe text, or an import from CookPilot.
- Output: a clean printable recipe card or page that you can print or save as a PDF. Multiple recipes can be batched into one print job. A set of recipes can also be built into a cookbook with a cover, chapters, and an automatic table of contents, then exported as a print-ready PDF — US Letter for home printing, or full-bleed 8 x 10 for professional print-on-demand binding.
- What it keeps: title, ingredients, instructions, notes, prep time, cook time, and servings when available.
- Best-fit searches: print recipe from website, print recipe without ads, print recipe from URL, convert recipe to PDF, printable recipe card generator, print Pinterest recipes, print Instagram recipes, print recipes from Facebook, print recipe from YouTube, print TikTok recipes, organize recipes, recipe binder, preserve family recipes, make a cookbook, create a family cookbook, recipe book maker.
- What it is not: not a recipe discovery app, meal planner, grocery app, nutrition tracker, or social network.
- Made by ${PUBLISHER.name} (${PUBLISHER.url}).

## Pages
- [${SITE_NAME}](${absoluteUrl("/")}): ${SITE_DESCRIPTION}
${pages}

## Ways to Use RecipePrinter

${entryPages}

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
