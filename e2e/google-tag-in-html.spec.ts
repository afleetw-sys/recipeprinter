import { expect, test } from "@playwright/test";

/**
 * Google Ads checks a site for its tag by reading the page, and kept reporting
 * "set up Google tag on your website" for recipeprinter.com: the tag was only
 * ever added by script after the page loaded, so the page Google read had no
 * sign of it. The loader is now in every page's own HTML, with its privacy
 * checks running before it loads anything (lib/googleTag.ts).
 *
 * Raw HTML, no browser: this is what a scanner sees, and nothing runs.
 */
test("every kind of page carries the Google tag loader in its own HTML", async ({ request }) => {
  for (const path of ["/", "/print", "/projects", "/privacy", "/recipe-card-printer"]) {
    const html = await (await request.get(path)).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head, path).toContain("googletagmanager.com/gtm.js?id=");
    expect(head, path).toContain("GTM-T9LW4QJF");
  }
});
