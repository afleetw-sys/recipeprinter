import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An image can sit in public/images on the machine that wrote the code and
 * never reach git, so it shows locally and 404s in production. The hero on
 * /recipe-book-gift (/images/cookbook-printed-cover.jpg) shipped that way
 * (found 2026-10-05). Checking the disk would pass on that same machine, so
 * this asks git instead: every local image the code references is tracked.
 */

const root = process.cwd();
const referencing = [
  "lib/seoAssets.ts",
  "components/RecipeCardPrint.tsx",
  "app/print/print.css",
  "app/globals.css",
];

const referenced = Array.from(
  new Set(
    referencing.flatMap(
      (file) =>
        readFileSync(join(root, file), "utf8").match(
          /\/images\/[\w/.-]+\.(?:svg|png|jpe?g|webp|gif|avif)/g,
        ) ?? [],
    ),
  ),
);

const tracked = new Set(
  execSync("git ls-files public/images", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((path) => path.replace(/^public/, "")),
);

describe("referenced images", () => {
  it("finds the references it is meant to check", () => {
    expect(referenced.length).toBeGreaterThan(20);
  });

  it("are all committed to git", () => {
    expect(referenced.filter((path) => !tracked.has(path))).toEqual([]);
  });
});
