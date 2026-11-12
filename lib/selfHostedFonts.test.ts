import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Fonts are served from app/fonts, never fetched from Google Fonts at build
// time: that fetch failed a Vercel deploy outright (2026-10-01) and quietly
// built with fallback faces in CI, which the layout sweep then measured. See
// the note above the fonts in app/layout.tsx.

const SOURCE_DIRS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) ? [path] : [];
  });
}

describe("fonts", () => {
  it("are never fetched from Google Fonts at build or run time", () => {
    const offenders = SOURCE_DIRS.flatMap(sourceFiles).filter((file) =>
      /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.filter((file) => !file.endsWith("selfHostedFonts.test.ts"))).toEqual([]);
  });

  // The download is drawn by Linux Chromium, which has none of a Mac's system
  // faces and answers a request for one with whatever fontconfig calls its
  // stand-in (Liberation Serif for "Times New Roman"), so a card face that
  // names a system font first previews in one face and downloads in another.
  it("on a recipe card start with a bundled face, so a download matches the preview", () => {
    const css = readFileSync("app/print/print.css", "utf8");
    const stacks = Array.from(css.matchAll(/(?:^|[;{\s])(font-family|--recipe-[a-z0-9-]*font)\s*:\s*([^;}]+)/g), (match) => `${match[1]}: ${match[2]!.trim()}`);
    expect(stacks.length).toBeGreaterThan(0);
    expect(stacks.filter((stack) => !/:\s*(var\(--|inherit\b|initial\b|unset\b)/.test(stack))).toEqual([]);
  });

  it("each come with their licence", () => {
    const families = readdirSync("app/fonts").filter((name) => statSync(join("app/fonts", name)).isDirectory());
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(readdirSync(join("app/fonts", family)), family).toContain("LICENSE.txt");
    }
  });
});
