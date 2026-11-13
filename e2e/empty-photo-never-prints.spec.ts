import { expect, test } from "./guarded";

/**
 * A photo that is on but not added yet prints as nothing. In a book of the
 * cook's own photos, a recipe without one holds the photo's place on screen
 * with an "Add a photo" box. Its icon was screen-only, but the box itself is
 * the theme's photo frame, so the PDF came out with an empty frame where the
 * photo goes: Classic's white mat, Bistro's tilted blue frame, Diner's
 * sky-blue mat, Pantry's tape stuck to nothing. Every theme, both sizes, card
 * and book, read-only and under edit (`/print/harness?photoslot=1`,
 * app/print/harness/PhotoSlotSpecimens.tsx): in print media the slot, all it
 * holds and its ::before/::after draw nothing.
 */

test.skip(({ browserName }) => browserName !== "chromium", "print media CSS is the same rule in every engine");

test("an empty photo slot draws nothing on paper, on every theme and size", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/print/harness?photoslot=1");
  await page.locator("[data-photo-slot-specimens-ready]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });

  const result = await page.evaluate(() => {
    const transparent = (c: string) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
    const paints = (s: CSSStyleDeclaration) => {
      if (s.visibility !== "visible" || s.display === "none" || s.opacity === "0") return [];
      const out: string[] = [];
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        const style = s.getPropertyValue(`border-${side.toLowerCase()}-style`);
        const width = parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`));
        if (style !== "none" && style !== "hidden" && width > 0) out.push(`border ${style}`);
      }
      if (!transparent(s.backgroundColor)) out.push(`background ${s.backgroundColor}`);
      if (s.backgroundImage !== "none") out.push("background image");
      if (s.boxShadow !== "none") out.push("shadow");
      if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) out.push("outline");
      return Array.from(new Set(out));
    };
    const specimens = Array.from(document.querySelectorAll<HTMLElement>("[data-photo-slot-specimen]"));
    const drawn: string[] = [];
    let slots = 0;
    for (const specimen of specimens) {
      for (const slot of Array.from(specimen.querySelectorAll<HTMLElement>(".recipe-card__photo--placeholder"))) {
        slots += 1;
        for (const el of [slot, ...Array.from(slot.querySelectorAll<HTMLElement>("*"))]) {
          const own = el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
            ? [
                ...paints(getComputedStyle(el)),
                ...(el instanceof SVGElement || el.childNodes.length && el.innerText.trim() ? ["content"] : []),
              ]
            : [];
          for (const pseudo of ["::before", "::after"]) {
            const ps = getComputedStyle(el, pseudo);
            if (ps.content === "none" || ps.content === "normal") continue;
            if (ps.visibility !== "visible" || ps.display === "none") continue;
            own.push(...paints(ps).map((p) => `${pseudo} ${p}`));
            if (ps.content !== '""') own.push(`${pseudo} content`);
          }
          if (own.length) drawn.push(`${specimen.dataset.photoSlotSpecimen} ${el.className}: ${own.join(", ")}`);
        }
      }
    }
    return { specimens: specimens.length, slots, drawn };
  });

  // 17 themes × (2 card sizes + 1 book size) × read-only and editing.
  expect(result.specimens, "pages compared").toBeGreaterThan(90);
  expect(result.slots, "every page holds an empty photo slot").toBe(result.specimens);
  expect(result.drawn, "drawn on paper where no photo has been added").toEqual([]);
});
