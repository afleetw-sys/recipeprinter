import { expect, test } from "./guarded";
import { untilHydrated } from "./hydrated";

/**
 * The home page's link field is in the server-rendered HTML, so it can be
 * typed into before React has taken the page over. On a slow phone, pasting
 * straight away is the normal thing to do. React 18 does not replay that
 * typing: the field's state starts empty, so the link was wiped on the next
 * render, or Enter submitted an empty box and the cook was told to paste a
 * link they had just pasted.
 *
 * A slow runner hit this by chance (the iPhone project's import test). Here the
 * app's JavaScript is held back on purpose, so the race happens every time.
 */

const LINK = "https://www.wikipedia.org/recipes/lemon-herb-chicken";

test("a link pasted before the page has finished loading is still there to import", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/chunks\//, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const field = page.getByPlaceholder("Paste a recipe link");
  await field.fill(LINK);

  release();
  await untilHydrated(field);

  await expect(field).toHaveValue(LINK);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/print$/);
});
