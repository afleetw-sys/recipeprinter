import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./guarded";
import reply from "./fixtures/cookpilot-reply.json";

/**
 * Several iPhone photos imported at once all reach the parser.
 *
 * Chrome can't decode HEIC, so each photo goes through heic2any's wasm decoder
 * first (lib/heicTranscode.ts). That decoder broke after one photo: the first
 * converted and every later one failed for the rest of the page. Nothing said
 * so, because a batch keeps whichever photos decoded (`prepareImageDataUrls`),
 * so a three-photo recipe was quietly read from its first photo alone.
 *
 * The photo is a real iPhone HEIC. The parser call is answered here, so the
 * test sees exactly what the browser would have sent CookPilot.
 */

const photo = readFileSync(join(__dirname, "fixtures", "recipe-photo.heic"));

test("three HEIC photos picked together are all sent to the parser, as JPEGs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "only Chromium needs the HEIC decoder; Safari reads HEIC itself");
  test.setTimeout(120_000);

  const sent: string[][] = [];
  await page.route("**/parseRecipeFromImages", async (route) => {
    sent.push(route.request().postDataJSON()?.data?.images ?? []);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: reply }) });
  });

  await page.goto("/");
  // Clicked again until the page has hydrated and the photo picker shows.
  const picker = page.getByLabel("Choose recipe photos");
  await expect(async () => {
    await page.getByRole("button", { name: "Image", exact: true }).click();
    await expect(picker).toBeAttached({ timeout: 1_000 });
  }).toPass();
  await picker.setInputFiles(
    ["IMG_0001", "IMG_0002", "IMG_0003"].map((name) => ({ name: `${name}.HEIC`, mimeType: "image/heic", buffer: photo })),
  );
  await page.getByRole("button", { name: /Read my photo/ }).click();

  await expect.poll(() => sent.length, { timeout: 90_000 }).toBe(1);
  expect(sent[0]).toHaveLength(3);
  for (const image of sent[0]) expect(image).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator(".recipe-card").filter({ hasText: reply.recipe.title }).first()).toBeVisible();
});
