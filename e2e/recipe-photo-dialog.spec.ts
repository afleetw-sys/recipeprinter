import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { deckSettled } from "./workspace";

/**
 * One press in a recipe's Photo dialog sets THAT recipe's photo layout, from
 * whatever it was before.
 *
 * Choosing None on a Full page recipe took two presses (Amelia, 2026-11-12).
 * The first did set it, but taking the full-page photo out moved every later
 * page down one, the deck re-selected its page against the layout it was still
 * showing, and so it landed on the NEXT recipe. The toolbar's picker kept its
 * dialog open across that change, so the dialog now showed (and set) the next
 * recipe: its None wasn't pressed, and pressing it changed the wrong recipe.
 *
 * Desktop: the dialog is opened from the page toolbar. The book is opened from
 * session storage, so nothing is imported or billed.
 */
test.skip(({ isMobile }) => isMobile, "the Photo dialog is opened from the desktop page toolbar");

const PHOTO = "/images/og-recipe-card.jpg";
type Mode = "none" | "card" | "full";
const LABEL: Record<Mode, string> = { none: "None", card: "In page", full: "Full page" };

const recipe = (id: string, title: string) => ({
  id,
  method: "manual",
  source: "test",
  status: "ready",
  title,
  addedAt: 0,
  recipe: { title, ingredients: [{ raw: "1 cup flour" }], instructions: [{ step: 1, text: "Mix and bake." }] },
});

/** A recipe's stored placement for a mode, in a book of the cook's own photos. */
const placementFor = (mode: Mode) =>
  mode === "full"
    ? { pageLayout: "image-spread", photoUrl: PHOTO }
    : { pageLayout: "full", showPhoto: mode === "card", photoUrl: PHOTO };

/** What the dialog would show for one recipe, read back from storage the way
    `photoModeFor` reads it (the book's own default is None). */
async function storedMode(page: Page, id: string): Promise<Mode> {
  return page.evaluate((recipeId) => {
    const meta = JSON.parse(sessionStorage.getItem("recipeprinter:project-meta:v1") ?? "{}");
    const placement = meta.itemPlacements?.[recipeId];
    if (placement?.pageLayout === "image-spread") return "full";
    if (placement?.pageLayout === "full") return placement.showPhoto ? "card" : "none";
    return meta.photoStyle ?? "none";
  }, id) as Promise<Mode>;
}

async function openBook(page: Page, middle: Mode) {
  const items = [recipe("r1", "Pancakes"), recipe("r2", "Waffles"), recipe("r3", "Toast")];
  // Off /print first: the open print page saves its own project as it
  // unloads, and when that landed after the seed below the book opened as
  // recipe cards, with no "2 Waffles" row to find (flaky in CI, every time
  // locally). robots.txt is same-origin, so it shares the session storage.
  await page.goto("/robots.txt");
  await page.evaluate(
    ({ items, placements }) => {
      sessionStorage.clear();
      sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(items));
      sessionStorage.setItem(
        "recipeprinter:print-job:current:v1",
        JSON.stringify({ ids: items.map((item: { id: string }) => item.id) }),
      );
      sessionStorage.setItem(
        "recipeprinter:project-meta:v1",
        JSON.stringify({
          cookbookMode: true,
          ownPhotosOnly: true,
          photoStyle: "none",
          sections: [],
          itemPlacements: placements,
        }),
      );
    },
    {
      items,
      // The recipe after the one being changed shows its photo In page, so a
      // dialog that drifts onto it shows something other than the choice made.
      placements: { r1: placementFor("card"), r2: placementFor(middle), r3: placementFor("card") },
    },
  );
  await page.goto("/print");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: /^\d+ Waffles$/ }).click();
  await deckSettled(page);
}

test("one press in a recipe's Photo dialog sets that recipe's layout, from any layout", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/print");
  const modes: Mode[] = ["none", "card", "full"];
  for (const from of modes) {
    for (const to of modes) {
      if (from === to) continue;
      const step = `${LABEL[from]} → ${LABEL[to]}`;
      await openBook(page, from);
      await page.locator(".recipe-page-toolbar__photo").filter({ visible: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: LABEL[from], exact: true }), step).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await dialog.getByRole("button", { name: LABEL[to], exact: true }).click();
      await deckSettled(page);

      await expect.poll(() => storedMode(page, "r2"), step).toBe(to);
      // The next recipe is left alone.
      expect(await storedMode(page, "r3"), step).toBe("card");
      // A dialog still open is still this recipe's, showing the choice made,
      // so nothing asks for a second press.
      if (await dialog.isVisible()) {
        await expect(dialog.getByRole("button", { name: LABEL[to], exact: true }), step).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
      await page.keyboard.press("Escape");
    }
  }
});
