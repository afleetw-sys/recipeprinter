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

  it("each come with their licence", () => {
    const families = readdirSync("app/fonts").filter((name) => statSync(join("app/fonts", name)).isDirectory());
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(readdirSync(join("app/fonts", family)), family).toContain("LICENSE.txt");
    }
  });
});
