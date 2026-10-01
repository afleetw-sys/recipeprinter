import type { Page, Request } from "@playwright/test";
import { expect, test } from "./guarded";
import { firestoreRunning, returningUser, signIn } from "./account";

/**
 * Nothing may be loading at the moment the Print button calls `print()`.
 *
 * Safari's `window.print()` does not open the dialog while any request on the
 * page is still loading; it waits for the last one and prints then (WebKit's
 * `m_shouldPrintWhenFinishedLoading`). Chrome has no such wait. Firestore keeps
 * a streaming `Listen/channel` fetch open for 60 seconds after any read or
 * write, so a signed-in cook's Print sat for up to a minute, and the button's
 * spinner gave up long before the dialog came (fixed 2026-10-01).
 *
 * No test browser opens a real print dialog, so this can't time the wait. It
 * checks what causes it instead: which requests are open when `print()` runs.
 * That holds in every engine, so Chromium catches it as well as WebKit, and it
 * names the culprit, whatever it is: a stream, a long-poll, a slow upload.
 *
 * Requests are watched through Playwright, not from inside the page: a page
 * script that clones a streamed response to see it end keeps the stream open.
 */

/** Photos still loading are fine: the print needs them, and the deck asks for
    every one of them in the same click (`loadDeckPhotosNow`). */
const MAY_STILL_LOAD = new Set(["image", "font"]);

const recipe = {
  title: "Lemon Herb Chicken",
  servings: "4",
  ingredients: [{ raw: "4 chicken thighs" }, { raw: "1 lemon" }, { raw: "2 tbsp thyme" }],
  instructions: [{ step: 1, text: "Roast at 425F until golden, about 35 minutes." }],
};

function watchRequests(page: Page) {
  const open = new Set<Request>();
  page.on("request", (request) => open.add(request));
  page.on("requestfinished", (request) => open.delete(request));
  page.on("requestfailed", (request) => open.delete(request));
  return open;
}

/** `window.print` replaced by a stand-in that tells the test when it ran. The
    stand-in fires nothing, so the page's own print handling stays put. */
async function stubPrint(page: Page, onPrint: () => void) {
  await page.exposeFunction("__printCalled", onPrint);
  await page.addInitScript(() => {
    window.print = () => {
      void (window as unknown as { __printCalled: () => Promise<void> }).__printCalled();
    };
  });
}

async function openPrint(page: Page) {
  const queue = [{ id: "r1", method: "text", source: "test", status: "ready", title: recipe.title, recipe }];
  await page.addInitScript((items) => {
    sessionStorage.setItem("recipeprinter:queue:v1", items);
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: ["r1"] }));
  }, JSON.stringify(queue));
  await page.goto("/print?ids=r1");
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible();
  await expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);
}

const printButton = (page: Page) =>
  page.getByRole("button", { name: /^(Buy & )?Print$/ }).filter({ visible: true });

/** Press Print the way a cook does (pointerdown, then click), and return every
    request still open when `print()` ran, images and fonts aside. */
async function openAtPrint(page: Page, open: Set<Request>, printed: Promise<void>) {
  await printButton(page).click();
  await printed;
  return Array.from(open)
    .filter((request) => !MAY_STILL_LOAD.has(request.resourceType()))
    .map((request) => `${request.resourceType()} ${request.url().slice(0, 120)}`);
}

function printSignal() {
  let resolve!: () => void;
  const printed = new Promise<void>((r) => (resolve = r));
  return { printed, onPrint: () => resolve() };
}

test("nothing is loading when Print calls print()", async ({ page }) => {
  const open = watchRequests(page);
  const { printed, onPrint } = printSignal();
  await stubPrint(page, onPrint);
  await openPrint(page);

  expect(await openAtPrint(page, open, printed)).toEqual([]);
});

test("signed in, Firestore's open stream is closed before print()", async ({ page, request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
  const { email } = await returningUser(request);
  await signIn(page, email);

  const open = watchRequests(page);
  const { printed, onPrint } = printSignal();
  await stubPrint(page, onPrint);
  await openPrint(page);
  // Without a stream open, this proves nothing. A signed-in /print reads the
  // account's records, which is what opens one.
  await expect
    .poll(() => Array.from(open).some((r) => r.url().includes("/google.firestore.v1.Firestore/Listen/channel")), {
      message: "a Firestore stream is open before printing",
    })
    .toBe(true);

  expect(await openAtPrint(page, open, printed)).toEqual([]);
});
