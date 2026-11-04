import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * A delete dialog's heading names what it deletes, and a name can be anything
 * a cook or an import left there: a failed import is titled with its link, and
 * a link has no spaces to wrap at. That heading ran straight out of the dialog
 * and off the screen (Amelia's screenshot, 2026-11-03).
 *
 * Every "are you sure?" is the one ConfirmDialog, so its heading and its
 * message are checked here through the print page's delete, at a phone's width
 * and a desktop's, with a name that can't wrap and one that's just long.
 *
 * Real layout, so a real browser: jsdom has no widths to run out of. The book
 * is opened from session storage, so nothing is imported or billed.
 */

const NAMES = [
  "https://www.pinterest.com/search/pins/?q=easy%20strawberry%20shortcake%20recipe&utm_source=google_search&utm_medium=paid&utm_campaign=269125559&placement=&match_type=b&device_type=c&network=g&gad_source=1",
  "Grandma Ruth's Famous Slow Cooker Barbecue Pulled Pork Sandwiches With Homemade Coleslaw And Pickled Red Onions For A Crowd",
];

async function openWith(page: Page, title: string) {
  await page.addInitScript((name) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    const item = {
      id: "r1",
      method: "manual",
      source: "test",
      status: "ready",
      title: name,
      addedAt: 0,
      recipe: {
        title: name,
        ingredients: [{ raw: "1 cup flour" }],
        instructions: [{ step: 1, text: "Mix and bake." }],
      },
    };
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify([item]));
    sessionStorage.setItem(
      "recipeprinter:print-job:current:v1",
      JSON.stringify({ ids: ["r1"] }),
    );
  }, title);
  await page.goto("/print");
}

for (const width of [375, 1280]) {
  for (let index = 0; index < NAMES.length; index += 1) {
    const name = NAMES[index];
    test(`a delete dialog keeps a long name inside itself at ${width}px (${index === 0 ? "a link" : "a long title"})`, async ({
      page,
    }) => {
      {
        await page.setViewportSize({ width, height: 800 });
        await openWith(page, name);
        await page
          .locator(".recipe-page-toolbar")
          .filter({ visible: true })
          .first()
          .getByRole("button", { name: /^Delete / })
          .click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();

        const boxes = await dialog.evaluate((node) => {
          const panel = (node
            .querySelector("h2")
            ?.closest("[class*='rounded-2xl']") ?? node) as HTMLElement;
          const box = (el: Element | null) => {
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
              left: rect.left,
              right: rect.right,
              scroll: (el as HTMLElement).scrollWidth,
              client: (el as HTMLElement).clientWidth,
            };
          };
          return {
            panel: box(panel),
            heading: box(node.querySelector("h2")),
            message: box(node.querySelector("h2 + div")),
            viewport: window.innerWidth,
          };
        });
        expect(boxes.panel && boxes.heading && boxes.message).toBeTruthy();
        const { panel, heading, message, viewport } = boxes as {
          panel: { left: number; right: number };
          heading: {
            left: number;
            right: number;
            scroll: number;
            client: number;
          };
          message: {
            left: number;
            right: number;
            scroll: number;
            client: number;
          };
          viewport: number;
        };
        // The dialog itself is on screen, and its words are inside it.
        expect(panel.right).toBeLessThanOrEqual(viewport + 0.5);
        for (const text of [heading, message]) {
          expect(text.scroll).toBeLessThanOrEqual(text.client + 1);
          expect(text.right).toBeLessThanOrEqual(panel.right + 0.5);
        }
      }
    });
  }
}
