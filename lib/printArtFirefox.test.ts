import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Firefox prints a card BLANK when its artwork is an SVG that embeds a raster
 * (`<image href="data:image/...">`, directly or through a pattern fill): the
 * print stops painting after the first few lines. Christmas shipped that way
 * and printed only its title in Firefox (found 2026-10-01). Screen rendering
 * is fine, so nothing short of a real Firefox print shows it.
 *
 * So any print artwork that embeds a raster must give Firefox a pre-rendered
 * image in the `@supports (-moz-appearance: none)` block in print.css — or,
 * better, be drawn as real vectors or shipped as a plain image to begin with.
 */

const root = process.cwd();
const printCss = readFileSync(join(root, "app/print/print.css"), "utf8");
const sources = [
  printCss,
  readFileSync(join(root, "components/RecipeCardPrint.tsx"), "utf8"),
].join("\n");

/** Every SVG under /images that the print surface references. */
const printArt = Array.from(new Set(sources.match(/\/images\/[\w/.-]+\.svg/g) ?? []));

/** The CSS inside the Firefox-only `@supports (-moz-appearance: none)` blocks. */
function firefoxBlocks(css: string): string {
  const out: string[] = [];
  let from = css.indexOf("@supports (-moz-appearance: none)");
  while (from !== -1) {
    let depth = 0;
    let i = css.indexOf("{", from);
    const start = i;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) break;
    }
    out.push(css.slice(start, i));
    from = css.indexOf("@supports (-moz-appearance: none)", i);
  }
  return out.join("\n");
}

describe("print artwork in Firefox", () => {
  it("finds the print artwork it is meant to check", () => {
    expect(printArt).toContain("/images/christmas-linen.svg");
    expect(printArt).toContain("/images/christmas-hats.svg");
  });

  it("gives Firefox a plain image for every SVG that embeds a raster", () => {
    const firefox = firefoxBlocks(printCss);
    const missing = printArt.filter((path) => {
      const svg = readFileSync(join(root, "public", path), "utf8");
      if (!/<image\b[^>]*href="data:image\//.test(svg)) return false;
      const fallback = path.replace(/\.svg$/, ".webp");
      return !existsSync(join(root, "public", fallback)) || !firefox.includes(fallback);
    });
    expect(missing, "SVG art with an embedded raster and no Firefox fallback").toEqual([]);
  });
});
