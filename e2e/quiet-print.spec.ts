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
 * reconstructs it instead: which requests were open at the instant `print()`
 * ran, and how long each went on after it. That is how long Safari would hold
 * the dialog. It holds in every engine, so Chromium catches it as well as
 * WebKit, and it names the culprit, whatever it is: a stream, a long-poll, a
 * slow upload.
 *
 * The instant is taken inside the page, by the stand-in `print()`. Reading the
 * open requests when the test hears about the call instead (as this first did)
 * is a few hundred ms late on a slow runner, and counted Firestore's own
 * goodbye beacon, sent by closing the stream on the press, which starts after
 * `print()`. It also failed on a save that happened to be in flight at the
 * click and finished 24 ms later: Safari waits that out without anyone seeing
 * it, and cancelling a save to print sooner would lose it. So a request only
 * counts if it would hold the dialog for longer than a cook would notice.
 *
 * Requests are watched through Playwright, not from inside the page: a page
 * script that clones a streamed response to see it end keeps the stream open.
 */

/** Photos still loading are fine: the print needs them, and the deck asks for
    every one of them in the same click (`loadDeckPhotosNow`). */
const MAY_STILL_LOAD = new Set(["image", "font"]);

/** Longer than this after `print()` and Safari's dialog visibly waits for it. */
const NOTICEABLE_MS = 1_000;

const recipe = {
  title: "Lemon Herb Chicken",
  servings: "4",
  ingredients: [{ raw: "4 chicken thighs" }, { raw: "1 lemon" }, { raw: "2 tbsp thyme" }],
  instructions: [{ step: 1, text: "Roast at 425F until golden, about 35 minutes." }],
};

/** When each request started and ended, in the browser's epoch ms. An end of
    `undefined` is a request still open. */
function watchRequests(page: Page) {
  const seen = new Map<Request, { start: number; end?: number }>();
  const ended = (request: Request) => {
    const entry = seen.get(request);
    if (!entry) return;
    const { startTime, responseEnd } = request.timing();
    if (startTime > 0) entry.start = startTime;
    entry.end = startTime > 0 && responseEnd >= 0 ? startTime + responseEnd : Date.now();
  };
  page.on("request", (request) => {
    const { startTime } = request.timing();
    seen.set(request, { start: startTime > 0 ? startTime : Date.now() });
  });
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  return seen;
}

/** `window.print` replaced by a stand-in that tells the test the instant it
    ran. The stand-in fires nothing, so the page's own print handling stays put. */
async function stubPrint(page: Page, onPrint: (at: number) => void) {
  await page.exposeFunction("__printCalled", onPrint);
  await page.addInitScript(() => {
    window.print = () => {
      void (window as unknown as { __printCalled: (at: number) => Promise<void> }).__printCalled(Date.now());
    };
  });
}

const isOpen = (seen: ReturnType<typeof watchRequests>, match: (url: string) => boolean) =>
  Array.from(seen).some(([request, { end }]) => end === undefined && match(request.url()));

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
    request that was open when `print()` ran and went on long enough after it
    to hold Safari's dialog, images and fonts aside. */
async function heldAtPrint(page: Page, seen: ReturnType<typeof watchRequests>, printed: Promise<number>) {
  await printButton(page).click();
  const at = await printed;
  const openAtPrint = () =>
    Array.from(seen).filter(
      ([request, { start, end }]) =>
        !MAY_STILL_LOAD.has(request.resourceType()) && start <= at && (end === undefined || end > at),
    );
  // Give each one the chance to finish, so a short one reads as short.
  await expect
    .poll(() => openAtPrint().every(([, { end }]) => end !== undefined), { timeout: NOTICEABLE_MS + 2_000 })
    .toBe(true)
    .catch(() => undefined);
  return openAtPrint()
    .filter(([, { end }]) => end === undefined || end - at > NOTICEABLE_MS)
    .map(([request, { end }]) => {
      const held = end === undefined ? "still open" : `${Math.round(end - at)} ms`;
      return `${request.resourceType()} ${request.url().slice(0, 120)} (${held} after print())`;
    });
}

function printSignal() {
  let resolve!: (at: number) => void;
  const printed = new Promise<number>((r) => (resolve = r));
  return { printed, onPrint: (at: number) => resolve(at) };
}

test("nothing is loading when Print calls print()", async ({ page }) => {
  const seen = watchRequests(page);
  const { printed, onPrint } = printSignal();
  await stubPrint(page, onPrint);
  await openPrint(page);

  expect(await heldAtPrint(page, seen, printed), "requests that would hold Safari's print dialog").toEqual([]);
});

test("signed in, Firestore's open stream is closed before print()", async ({ page, request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
  const { email } = await returningUser(request);
  await signIn(page, email);

  const seen = watchRequests(page);
  const { printed, onPrint } = printSignal();
  await stubPrint(page, onPrint);
  await openPrint(page);
  // Without a stream open, this proves nothing. A signed-in /print reads the
  // account's records, which is what opens one.
  await expect
    .poll(() => isOpen(seen, (url) => url.includes("/google.firestore.v1.Firestore/Listen/channel")), {
      message: "a Firestore stream is open before printing",
    })
    .toBe(true);

  expect(await heldAtPrint(page, seen, printed), "requests that would hold Safari's print dialog").toEqual([]);
});
