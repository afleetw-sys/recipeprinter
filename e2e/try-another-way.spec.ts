import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { feedbackAlreadySeen, firestoreRunning, grantPro, returningUser, signIn } from "./account";
import { deckSettled } from "./workspace";

/**
 * "Try another way" on a failed import is the same recipe asked for again, so
 * it lands where the failed card stood. It used to go to the top of the job:
 * the loading card waited at the failed card's place, at the bottom, and the
 * deck then jumped up to the first page when the recipe arrived.
 *
 * The CookPilot stand-in (e2e/stubs/cookpilot.mjs) answers a wikipedia.org
 * link with a recipe and an example.com one with nothing, so nothing is
 * fetched and no scraper is billed.
 */

const GOOD = "https://www.wikipedia.org/recipes/lemon-herb-chicken";
const BAD = "https://example.com/recipes/anything";

test.beforeEach(async ({ request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
});

async function submitLink(page: Page, link: string) {
  const field = page.getByRole("dialog").getByPlaceholder("Paste a recipe link");
  await field.fill(link);
  await field.press("Enter");
}

async function addRecipe(page: Page, link: string) {
  await page.getByRole("button", { name: /^Add more\b/ }).filter({ visible: true }).first().click();
  await submitLink(page, link);
}

test("a failed import's replacement lands in its place, and the deck stays there", async ({ page, request }) => {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { __deckLog: unknown[] }).__deckLog = log;
    const t0 = performance.now();
    const deckOf = (el: unknown) => el instanceof HTMLElement && el.id === "recipe-page-deck";
    const info = (el: HTMLElement, kind: string, value: unknown) => {
      log.push({
        t: Math.round(performance.now() - t0), kind, value, top: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight,
        cards: el.querySelectorAll(".recipe-card").length, pending: !!el.querySelector("[data-pending-page]"),
        measuring: !!document.querySelector(".recipe-print-shell--measuring"), snap: el.style.scrollSnapType,
        stack: (new Error().stack || "").split("\n").slice(2, 7).map((l) => l.replace(/https?:\/\/[^ ]*\/_next\/static\/chunks\//, "")).join(" | "),
      });
    };
    const oScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (this: Element, ...a: unknown[]) {
      if (deckOf(this)) info(this as HTMLElement, "scrollTo", JSON.stringify(a[0]));
      return (oScrollTo as (...x: unknown[]) => void).apply(this, a);
    } as typeof Element.prototype.scrollTo;
    const d = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    Object.defineProperty(Element.prototype, "scrollTop", { ...d, set(this: Element, v: number) { if (deckOf(this)) info(this as HTMLElement, "scrollTop=", v); d.set!.call(this, v); } });
    let lastTop = -1, lastSnap = "?", lastCards = -1;
    const poll = () => {
      const el = document.getElementById("recipe-page-deck");
      if (el) {
        if (el.scrollTop !== lastTop || el.style.scrollSnapType !== lastSnap || el.querySelectorAll(".recipe-card").length !== lastCards) {
          lastTop = el.scrollTop; lastSnap = el.style.scrollSnapType; lastCards = el.querySelectorAll(".recipe-card").length;
          info(el, "observed", lastTop);
        }
        if (!(el as unknown as { __se?: boolean }).__se) {
          (el as unknown as { __se?: boolean }).__se = true;
          el.addEventListener("scrollend", () => info(el, "scrollend", el.scrollTop));
        }
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  const { email, uid } = await returningUser(request);
  await grantPro(request, uid);
  // The one-time feedback dialog comes up a moment after a second card import,
  // whenever that lands, even under the Add dialog. It isn't what this is
  // about, so it has already been seen.
  await feedbackAlreadySeen(request, uid);
  await signIn(page, email);
  const field = page.getByPlaceholder("Paste a recipe link");
  await field.fill(GOOD);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/print$/);
  for (const n of [2, 3]) {
    await addRecipe(page, `${GOOD}-${n}`);
    await expect(page.locator("[data-pending-page]")).toHaveCount(0);
  }
  await addRecipe(page, BAD);
  const failed = page.getByText("That recipe didn't import");
  await expect(failed).toBeVisible();
  await deckSettled(page);

  const deck = page.locator("#recipe-page-deck");
  const cards = page.locator("#recipe-page-deck .recipe-card");
  const before = await cards.count();
  await page.evaluate(() => (window as unknown as { __deckLog: unknown[] }).__deckLog.push("TRY-ANOTHER-WAY"));
  await page.getByRole("button", { name: "Try another way" }).click();
  await submitLink(page, `${GOOD}-4`);
  await expect(cards).toHaveCount(before + 1);
  await deckSettled(page);

  // The deck is still at the end of the job, where the failed card was...
  const { top, max } = await deck.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  await new Promise((r) => setTimeout(r, 1500));
  const after = await deck.evaluate((el) => el.scrollTop);
  const deckLog = await page.evaluate(() => (window as unknown as { __deckLog: unknown[] }).__deckLog);
  console.log("DECKLOG " + JSON.stringify({ top, max, after, deckLog }));
  expect(max).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(max - 40);
  // ...and the recipe that arrived is the current page, the last in the rail
  // (a phone has no rail; the scroll above is the whole of it there).
  const rail = page.getByRole("navigation", { name: "Pages" });
  if (await rail.isVisible()) {
    await expect(rail.getByRole("button").filter({ hasText: /Lemon/i }).last()).toHaveAttribute("aria-current", "true");
  }
});
