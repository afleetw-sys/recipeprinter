import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { firestoreRunning, savedProjectIds, savedProjectText, signIn } from "./account";
import { deckSettled, openRecipePage, selectedPage, startCookbook } from "./workspace";

/**
 * A cook's work is still there when they come back to it: after a reload,
 * after leaving the workspace and reopening the book from Projects, and on
 * another device. Each case is one that has broken before: an edit that undid
 * a neighbouring field (clearing the cook time brought the prep time back),
 * a duplicate sweep that deleted a book somebody meant to make, leaving the
 * workspace deleting the photos it had just filed, and a library read that
 * failed and reported an empty library instead.
 *
 * Desktop only: a phone reaches pages through the structure sheet rather than
 * the page rail these steps use, and its sign-in is a redirect (see
 * mobile-signin-is-a-redirect). Phones need their own pass.
 */

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
  test.skip(testInfo.project.name === "iphone", "desktop flow; phones reach pages through the structure sheet");
});

const field = (page: Page, name: string) => selectedPage(page).getByRole("textbox", { name, exact: true });

type Book = { uid: string; projectId: string };

/** Waits until the server holds what the page says is saved. "Saved" in the
    header can still be showing from the save before this one. */
async function onServer(request: APIRequestContext, book: Book, check: (text: string) => boolean) {
  await expect.poll(async () => check(await savedProjectText(request, book.uid, book.projectId))).toBe(true);
}

/** The edits every check below expects to find again. */
async function editRecipe(page: Page, request: APIRequestContext, book: Book) {
  await openRecipePage(page);
  await field(page, "Servings").fill("6");
  await field(page, "Servings").press("Tab");
  // Cleared, not changed: clearing it once brought the prep time back.
  await field(page, "Cook time").fill("");
  await field(page, "Cook time").press("Tab");
  await selectedPage(page).getByText("2 tablespoons olive oil").click();
  const ingredient = selectedPage(page).getByRole("textbox", { name: "Ingredient" });
  await expect(ingredient).toBeFocused();
  await ingredient.fill("3 tablespoons olive oil");
  await ingredient.press("Tab");
  await page.getByRole("button", { name: "Garden", exact: true }).click();
  await onServer(
    request,
    book,
    (text) =>
      text.includes("3 tablespoons olive oil") &&
      !/"cookTime":\s*\{\s*"stringValue":\s*"25 min"/.test(text) &&
      text.includes('"garden"') &&
      /"servings":\s*\{\s*"(stringValue|integerValue)":\s*"6"/.test(text),
  );
}

async function expectEdits(page: Page) {
  await openRecipePage(page);
  await expect(field(page, "Servings")).toHaveValue("6");
  // Cleared stays cleared: no cook time, and the prep time doesn't take its place.
  await expect(selectedPage(page).getByText("25 min", { exact: true })).toHaveCount(0);
  await expect(selectedPage(page).getByText("10 min", { exact: true })).toHaveCount(0);
  await expect(selectedPage(page).getByText("3 tablespoons olive oil")).toBeVisible();
  await expect(selectedPage(page).getByText("2 tablespoons olive oil")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Garden", exact: true })).toHaveAttribute("aria-pressed", "true");
}

/** Leaves through the logo, then reopens the book from Projects. */
async function leaveAndReopen(page: Page, projectId: string) {
  await page.getByRole("link", { name: "RecipePrinter home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/projects");
  await page.locator(`a[href="/print?project=${projectId}"]`).click();
  await expect(page).toHaveURL(/\/print/);
  await deckSettled(page);
}

/** The same account in a browser that has never seen this book. */
async function onAnotherDevice(browser: Browser, email: string, projectId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  await page.goto("/projects");
  await page.locator(`a[href="/print?project=${projectId}"]`).click();
  await deckSettled(page);
  return { page, close: () => context.close() };
}

test("a cookbook's edits are all there after a reload, after leaving, and on another device", async ({
  page,
  request,
  browser,
}) => {
  const { uid, email, projectId } = await startCookbook(page, request);
  await editRecipe(page, request, { uid, projectId });

  await page.reload();
  await expectEdits(page);

  await leaveAndReopen(page, projectId);
  await expectEdits(page);
  expect(await savedProjectIds(request, uid), "projects on the account").toEqual([projectId]);

  const other = await onAnotherDevice(browser, email, projectId);
  await expectEdits(other.page);
  await other.close();
});

test("starting a second cookbook leaves the first one alone", async ({ page, request }) => {
  const first = await startCookbook(page, request);
  await editRecipe(page, request, first);

  const second = await startCookbook(page, request, first);
  expect((await savedProjectIds(request, first.uid)).sort(), "projects on the account").toEqual(
    [first.projectId, second.projectId].sort(),
  );

  await page.goto("/projects");
  await expect(page.locator('a[href^="/print?project="]')).toHaveCount(2);
  await page.locator(`a[href="/print?project=${first.projectId}"]`).click();
  await deckSettled(page);
  await expectEdits(page);
});

test("a photo added to a recipe is still there after a reload and after leaving", async ({ page, request }) => {
  const book = await startCookbook(page, request);
  await openRecipePage(page);

  await selectedPage(page).locator("button", { hasText: "Add photo" }).click();
  await page.getByRole("dialog", { name: "Recipe photo" }).locator('input[type="file"]').setInputFiles({
    name: "chicken.png",
    mimeType: "image/png",
    buffer: Buffer.from(PHOTO_PNG, "base64"),
  });
  await expect(page.getByRole("dialog", { name: "Recipe photo" })).toHaveCount(0);
  // Saving uploads it: the account holds the stored copy's address, never the
  // picked file (a blob: or data: URL that dies with the page).
  await onServer(request, book, (text) => text.includes("127.0.0.1:9299/") && !/"(blob|data):/.test(text));

  const photo = () => selectedPage(page).locator('img[src^="blob:"], img[src*="127.0.0.1:9299/"]').first();
  const showing = async () => {
    await expect(photo()).toBeVisible();
    await expect.poll(() => photo().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  };

  await page.reload();
  await openRecipePage(page);
  await showing();

  // Reopened from the account, so this one can only be the stored copy, and
  // leaving the workspace has not deleted it.
  await leaveAndReopen(page, book.projectId);
  await openRecipePage(page);
  await showing();
  expect(await photo().getAttribute("src")).toContain("127.0.0.1:9299/");
});

test("an edit made just before leaving is kept", async ({ page, request }) => {
  const book = await startCookbook(page, request);
  await openRecipePage(page);
  await field(page, "Servings").fill("6");
  await field(page, "Servings").press("Tab");
  // Straight out, before any autosave interval could have passed.
  await page.getByRole("link", { name: "RecipePrinter home" }).click();
  await expect(page).toHaveURL(/\/$/);

  await onServer(request, book, (text) => /"servings":\s*\{\s*"(stringValue|integerValue)":\s*"6"/.test(text));
  await page.goto("/projects");
  await page.locator(`a[href="/print?project=${book.projectId}"]`).click();
  await deckSettled(page);
  await openRecipePage(page);
  await expect(field(page, "Servings")).toHaveValue("6");
});

test("a library that fails to load says so, instead of showing no projects", async ({ page, request }) => {
  await startCookbook(page, request);
  await page.getByRole("link", { name: "RecipePrinter home" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Every Firestore request fails from here on, the way a dropped connection does.
  await page.route(/127\.0\.0\.1:8180/, (route) => route.abort("internetdisconnected"));
  await page.goto("/projects");

  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No saved projects yet")).toHaveCount(0);
});

/** A 64×48 photo-coloured PNG, big enough to decode and downscale like a real one. */
const PHOTO_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAPlklEQVR4nK3NBYHCAABAUYL9YIe7u7tbAWDDbbANdy1zJXgF" +
  "nqbzR/eP3h/CH+If/T8Gfwz/GP0x/mPyx/SP2R/zPxZ/LP+Q/lj9sf5D/kP5Q/1j88f2j90f+z8Ofxz/OP1x/uPyx/WP2x/3" +
  "Px5/PP94/fH+4/PH949fvZqOlq6WnhZBi6ilr2WgZahlpGWsZaJlqmWmZa5loWWpRdKy0rLWImtRtKhaNlq2WnZa9loOWo5a" +
  "TlrOWi5arlpuWu5aHlqeWl5a3lo+Wr5afvVqOjq6Ono6BB2ijr6OgY6hjpGOsY6JjqmOmY65joWOpQ5Jx0rHWoesQ9Gh6tjo" +
  "2OrY6djrOOg46jjpOOu46LjquOm463joeOp46Xjr+Oj46vjVq+no6erp6RH0iHr6egZ6hnpGesZ6JnqmemZ65noWepZ6JD0r" +
  "PWs9sh5Fj6pno2erZ6dnr+eg56jnpOes56Lnquem567noeep56Xnreej56vnV6+mY6BroGdAMCAa6BsYGBgaGBkYG5gYmBqY" +
  "GZgbWBhYGpAMrAysDcgGFAOqgY2BrYGdgb2Bg4GjgZOBs4GLgauBm4G7gYeBp4GXgbeBj4GvgV+9mo6RrpGeEcGIaKRvZGBk" +
  "aGRkZGxkYmRqZGZkbmRhZGlEMrIysjYiG1GMqEY2RrZGdkb2Rg5GjkZORs5GLkauRm5G7kYeRp5GXkbeRj5GvkZ+9Wo6Jrom" +
  "eiYEE6KJvomBiaGJkYmxiYmJqYmZibmJhYmlCcnEysTahGxCMaGa2JjYmtiZ2Js4mDiaOJk4m7iYuJq4mbibeJh4mniZeJv4" +
  "mPia+NWr6ZjpmumZEcyIZvpmBmaGZkZmxmYmZqZmZmbmZhZmlmYkMyszazOyGcWMamZjZmtmZ2Zv5mDmaOZk5mzmYuZq5mbm" +
  "buZh5mnmZeZt5mPma+ZXr6ZjoWuhZ0GwIFroWxhYGFoYWRhbmFiYWphZmFtYWFhakCysLKwtyBYUC6qFjYWthZ2FvYWDhaOF" +
  "k4WzhYuFq4WbhbuFh4WnhZeFt4WPha+FX72ajpWulZ4VwYpopW9lYGVoZWRlbGViZWplZmVuZWFlaUWysrKytiJbUayoVjZW" +
  "tlZ2VvZWDlaOVk5WzlYuVq5WblbuVh5WnlZeVt5WPla+Vn71ajo2ujZ6NgQboo2+jYGNoY2RjbGNiY2pjZmNuY2FjaUNycbK" +
  "xtqGbEOxodrY2Nja2NnY2zjYONo42TjbuNi42rjZuNt42HjaeNl42/jY+Nr41avp2Ona6dkR7Ih2+nYGdoZ2RnbGdiZ2pnZm" +
  "duZ2FnaWdiQ7KztrO7IdxY5qZ2Nna2dnZ2/nYOdo52TnbOdi52rnZudu52Hnaedl523nY+dr51evpuOg66DnQHAgOug7GDgY" +
  "Ohg5GDuYOJg6mDmYO1g4WDqQHKwcrB3IDhQHqoONg62DnYO9g4ODo4OTg7ODi4Org5uDu4OHg6eDl4O3g4+Dr4NfvZqOk66T" +
  "nhPBieik72TgZOhk5GTsZOJk6mTmZO5k4WTpRHKycrJ2IjtRnKhONk62TnZO9k4OTo5OTk7OTi5Ork5uTu5OHk6eTl5O3k4+" +
  "Tr5OfvVqOi66LnouBBeii76LgYuhi5GLsYuJi6mLmYu5i4WLpQvJxcrF2oXsQnGhuti42LrYudi7OLg4uji5OLu4uLi6uLm4" +
  "u3i4eLp4uXi7+Lj4uvjVq+m46brpuRHciG76bgZuhm5GbsZuJm6mbmZu5m4WbpZuJDcrN2s3shvFjepm42brZudm7+bg5ujm" +
  "5Obs5uLm6ubm5u7m4ebp5uXm7ebj5uvmV6+m46HroedB8CB66HsYeBh6GHkYe5h4mHqYeZh7WHhYepA8rDysPcgeFA+qh42H" +
  "rYedh72Hg4ejh5OHs4eLh6uHm4e7h4eHp4eXh7eHj4evh1+9mo6XrpeeF8GL6KXvZeBl6GXkZexl4mXqZeZl7mXhZelF8rLy" +
  "svYie1G8qF42XrZedl72Xg5ejl5OXs5eLl6uXm5e7l4eXp5eXl7eXj5evl5+9Wo6Pro+ej4EH6KPvo+Bj6GPkY+xj4mPqY+Z" +
  "j7mPhY+lD8nHysfah+xD8aH62PjY+tj52Ps4+Dj6OPk4+7j4uPq4+bj7ePh4+nj5ePv4+Pj6+NWr6fjp+un5EfyIfvp+Bn6G" +
  "fkZ+xn4mfqZ+Zn7mfhZ+ln4kPys/az+yH8WP6mfjZ+tn52fv5+Dn6Ofk5+zn4ufq5+bn7ufh5+nn5eft5+Pn6+dXr6YToBug" +
  "F0AIIAboBxgEGAYYBRgHmASYBpgFmAdYBFgGkAKsAqwDyAGUAGqATYBtgF2AfYBDgGOAU4BzgEuAa4BbgHuAR4BngFeAd4BP" +
  "gG+AX72aTpBukF4QIYgYpB9kEGQYZBRkHGQSZBpkFmQeZBFkGUQKsgqyDiIHUYKoQTZBtkF2QfZBDkGOQU5BzkEuQa5BbkHu" +
  "QR5BnkFeQd5BPkG+QX71ajohuiF6IYQQYoh+iEGIYYhRiHGISYhpiFmIeYhFiGUIKcQqxDqEHEIJoYbYhNiG2IXYhziEOIY4" +
  "hTiHuIS4hriFuId4hHiGeIV4h/iE+Ib41avphOmG6YURwohh+mEGYYZhRmHGYSZhpmFmYeZhFmGWYaQwqzDrMHIYJYwaZhNm" +
  "G2YXZh/mEOYY5hTmHOYS5hrmFuYe5hHmGeYV5h3mE+Yb5levphOhG6EXQYggRuhHGEQYRhhFGEeYRJhGmEWYR1hEWEaQIqwi" +
  "rCPIEZQIaoRNhG2EXYR9hEOEY4RThHOES4RrhFuEe4RHhGeEV4R3hE+Eb4RfvZpOlG6UXhQhihilH2UQZRhlFGUcZRJlGmUW" +
  "ZR5lEWUZRYqyirKOIkdRoqhRNlG2UXZR9lEOUY5RTlHOUS5RrlFuUe5RHlGeUV5R3lE+Ub5RfvVqOjG6MXoxhBhijH6MQYxh" +
  "jFGMcYxJjGmMWYx5jEWMZQwpxirGOoYcQ4mhxtjE2MbYxdjHOMQ4xjjFOMe4xLjGuMW4x3jEeMZ4xXjH+MT4xvjVq+nE6cbp" +
  "xRHiiHH6cQZxhnFGccZxJnGmcWZx5nEWcZZxpDirOOs4chwljhpnE2cbZxdnH+cQ5xjnFOcc5xLnGucW5x7nEecZ5xXnHecT" +
  "5xvnV6+mk6CboJdASCAm6CcYJBgmGCUYJ5gkmCaYJZgnWCRYJpASrBKsE8gJlARqgk2CbYJdgn2CQ4JjglOCc4JLgmuCW4J7" +
  "gkeCZ4JXgneCT4Jvgl+9mk6SbpJeEiGJmKSfZJBkmGSUZJxkkmSaZJZknmSRZJlESrJKsk4iJ1GSqEk2SbZJdkn2SQ5JjklO" +
  "Sc5JLkmuSW5J7kkeSZ5JXkneST5Jvkl+9Wo6KbopeimEFGKKfopBimGKUYpxikmKaYpZinmKRYplCinFKsU6hZxCSaGm2KTY" +
  "ptil2Kc4pDimOKU4p7ikuKa4pbineKR4pnileKf4pPim+NWr6aTppumlEdKIafppBmmGaUZpxmkmaaZpZmnmaRZplmmkNKs0" +
  "6zRyGiWNmmaTZptml2af5pDmmOaU5pzmkuaa5pbmnuaR5pnmlead5pPmm+ZXr6aToZuhl0HIIGboZxhkGGYYZRhnmGSYZphl" +
  "mGdYZFhmkDKsMqwzyBmUDGqGTYZthl2GfYZDhmOGU4ZzhkuGa4ZbhnuGR4ZnhleGd4ZPhm+GX72aTpZull4WIYuYpZ9lkGWY" +
  "ZZRlnGWSZZpllmWeZZFlmUXKssqyziJnUbKoWTZZtll2WfZZDlmOWU5ZzlkuWa5ZblnuWR5ZnlleWd5ZPlm+WX71ajo5ujl6" +
  "OYQcYo5+jkGOYY5RjnGOSY5pjlmOeY5FjmUOKccqxzqHnEPJoebY5Njm2OXY5zjkOOY45TjnuOS45rjluOd45HjmeOV45/jk" +
  "+Ob41avp5Onm6eUR8oh5+nkGeYZ5RnnGeSZ5pnlmeeZ5FnmWeaQ8qzzrPHIeJY+aZ5Nnm2eXZ5/nkOeY55TnnOeS55rnluee" +
  "55HnmeeV553nk+eb51evplOgW6BXQCggFugXGBQYFhgVGBeYFJgWmBWYF1gUWBaQCqwKrAvIBZQCaoFNgW2BXYF9gUOBY4FT" +
  "gXOBS4FrgVuBe4FHgWeBV4F3gU+Bb4FfvZpOkW6RXhGhiFikX2RQZFhkVGRcZFJkWmRWZF5kUWRZRCqyKrIuIhdRiqhFNkW2" +
  "RXZF9kUORY5FTkXORS5FrkVuRe5FHkWeRV5F3kU+Rb5FfvVqOiW6JXolhBJiiX6JQYlhiVGJcYlJiWmJWYl5iUWJZQmpxKrE" +
  "uoRcQimhltiU2JbYldiXOJQ4ljiVOJe4lLiWuJW4l3iUeJZ4lXiX+JT4lvjVq+mU6ZbplRHKiGX6ZQZlhmVGZcZlJmWmZWZl" +
  "5mUWZZZlpDKrMusychmljFpmU2ZbZldmX+ZQ5ljmVOZc5lLmWuZW5l7mUeZZ5lXmXeZT5lvmV6+mU6FboVdBqCBW6FcYVBhW" +
  "GFUYV5hUmFaYVZhXWFRYVpAqrCqsK8gVlApqhU2FbYVdhX2FQ4VjhVOFc4VLhWuFW4V7hUeFZ4VXhXeFT4VvhV+9mk6VbpVe" +
  "FaGKWKVfZVBlWGVUZVxlUmVaZVZlXmVRZVlFqrKqsq4iV1GqqFU2VbZVdlX2VQ5VjlVOVc5VLlWuVW5V7lUeVZ5VXlXeVT5V" +
  "vlV+9Wo6Nbo1ejWEGmKNfo1BjWGNUY1xjUmNaY1ZjXmNRY1lDanGqsa6hlxDqaHW2NTY1tjV2Nc41DjWONU417jUuNa41bjX" +
  "eNR41njVeNf41PjW+NWr6dTp1unVEeqIdfp1BnWGdUZ1xnUmdaZ1ZnXmdRZ1lnWkOqs66zpyHaWOWmdTZ1tnV2df51DnWOdU" +
  "51znUuda51bnXudR51nnVedd51PnW+dXr6bToNug10BoIDboNxg0GDYYNRg3mDSYNpg1mDdYNFg2kBqsGqwbyA2UBmqDTYNt" +
  "g12DfYNDg2ODU4Nzg0uDa4Nbg3uDR4Nng1eDd4NPg2+DX72aTpNuk14ToYnYpN9k0GTYZNRk3GTSZNpk1mTeZNFk2URqsmqy" +
  "biI3UZqoTTZNtk12TfZNDk2OTU5Nzk0uTa5Nbk3uTR5Nnk1eTd5NPk2+TX71ajotui16LYQWYot+i0GLYYtRi3GLSYtpi1mL" +
  "eYtFi2ULqcWqxbqF3EJpobbYtNi22LXYtzi0OLY4tTi3uLS4tri1uLd4tHi2eLV4t/i0+Lb41avptOm26bUR2oht+m0GbYZt" +
  "Rm3GbSZtpm1mbeZtFm2WbaQ2qzbrNnIbpY3aZtNm22bXZt/m0ObY5tTm3ObS5trm1ube5tHm2ebV5t3m0+bb5lfvP/pzwQ+W" +
  "7BD1AAAAAElFTkSuQmCC";
