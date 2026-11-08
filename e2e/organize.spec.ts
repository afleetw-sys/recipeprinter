import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * The cookbook organizer, on a book opened straight from session storage (no
 * import, nothing billed).
 *
 * The wide organizer is a desktop layout; phones reorder in their own sheet.
 */
test.skip(({ isMobile }) => isMobile, "the organizer is the desktop rail");

const recipe = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  method: "manual",
  source: "test",
  status: "ready",
  title,
  addedAt: 0,
  recipe: {
    title,
    ingredients: [{ raw: "1 cup flour" }],
    instructions: [{ step: 1, text: "Mix and bake." }],
    image: "/images/tomatoes.svg",
    ...extra,
  },
});

const BOOK = [
  recipe("r1", "Lemon Chicken"),
  recipe("r2", "Banana Bread", { image: undefined }),
  recipe("r3", "Oregano Potatoes", { note: "Grandma's version" }),
  recipe("r4", "Plain Toast", { instructions: [] }),
];

async function openOrganizer(page: Page, sections?: Array<{ id: string; title: string; itemIds: string[] }>) {
  await page.addInitScript(([items, chapters]) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    const queue = JSON.parse(items) as Array<{ id: string }>;
    sessionStorage.setItem("recipeprinter:queue:v1", items);
    sessionStorage.setItem(
      "recipeprinter:print-job:current:v1",
      JSON.stringify({ ids: queue.map((item) => item.id) }),
    );
    sessionStorage.setItem(
      "recipeprinter:project-meta:v1",
      JSON.stringify({
        cookbookIntent: true,
        sections: chapters
          ? JSON.parse(chapters)
          : [{ id: "s1", title: "Dinners", itemIds: queue.map((item) => item.id) }],
      }),
    );
  }, [JSON.stringify(BOOK), sections ? JSON.stringify(sections) : ""] as const);
  await page.goto("/print");
  // A new cookbook opens under its welcome; close it as a cook would.
  await expect(page.locator(".cookbook-welcome")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cookbook-welcome")).toHaveCount(0);
  await page.locator(".recipe-page-rail__organize").click();
  await expect(page.locator(".recipe-organize-bar")).toBeVisible();
  // Opening animates the panel's width; a menu opened mid-way is closed by it.
  await expect(page.locator(".recipe-print-shell--organize-animating")).toHaveCount(0);
}

test("an active toolbar button looks active", async ({ page }) => {
  await openOrganizer(page);
  const view = page.getByRole("button", { name: /^Sort and filter recipes/ });
  const look = (locator: typeof view) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.borderColor} ${style.backgroundColor}`;
    });
  await page.mouse.move(0, 0);
  const idle = await look(view);

  // A filter on its own, then an A-Z sort on its own: either has to show.
  await view.click();
  await page.getByRole("menuitemcheckbox", { name: /No photo/ }).click();
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  expect(await look(view)).not.toBe(idle);

  await view.click();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("menuitemradio", { name: /A–Z/ }).click();
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  expect(await look(view)).not.toBe(idle);
});

/**
 * A recipe let go anywhere inside a chapter's frame goes into that chapter.
 * The drop used to be resolved against the nearest card in the WHOLE book, so
 * empty space in a chapter (beside its last card, its padding) handed the
 * recipe to whichever chapter had a card closer to the pointer.
 */
test("a recipe dropped anywhere in a chapter lands in that chapter", async ({ page }) => {
  await openOrganizer(page, [
    { id: "s1", title: "Dinners", itemIds: ["r1", "r2", "r3"] },
    { id: "s2", title: "Breakfast", itemIds: ["r4"] },
  ]);
  const chapter = page.locator('[data-rail-section="s2"]');
  await expect(chapter.locator('[data-rail-recipe="r4"]')).toBeVisible();

  // Every empty part of the frame, one recipe each.
  const spots: Array<[string, (box: DOMRectReadOnly, card: DOMRectReadOnly) => { x: number; y: number }]> = [
    ["beside its last card", (box, card) => ({ x: box.right - 24, y: card.top + card.height / 2 })],
    ["in its bottom padding", (box) => ({ x: box.left + box.width / 2, y: box.bottom - 6 })],
    ["in its left padding", (box, card) => ({ x: box.left + 6, y: card.top + card.height / 2 })],
  ];
  const carried = ["r1", "r2", "r3"];
  for (let index = 0; index < spots.length; index += 1) {
    const [where, spot] = spots[index]!;
    const id = carried[index]!;
    const box = await chapter.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRectReadOnly);
    const card = await chapter
      .locator('[data-rail-recipe="r4"]')
      .evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRectReadOnly);
    const target = spot(box, card);
    const from = await page.locator(`[data-rail-recipe="${id}"]`).boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.move(target.x, target.y + 1, { steps: 2 });
    await page.mouse.up();
    await expect(chapter.locator(`[data-rail-recipe="${id}"]`), `${id} dropped ${where}`).toHaveCount(1);
  }
});
