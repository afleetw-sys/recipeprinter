import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/* Code that reaches the browser has to parse in every Safari we still see.
   Regex lookbehind, `(?<=…)` and `(?<!…)`, arrived in Safari 16.4; before that
   it is a SyntaxError, and in a regex built at module load (as
   lib/priceCurrency's was) that error takes down every page importing the
   module: a first-time visitor on Safari 15 got "This page ran into a
   problem" on the homepage. Neither SWC nor Next rewrites it, so the source is
   the only place to stop it. */

const ROOT = join(__dirname, "..");
const CLIENT_DIRS = ["app", "components", "lib"];
/** Never sent to a browser. */
const SERVER_ONLY = [/^app\/api\//, /^lib\/server\//, /\.test\.tsx?$/, /\.d\.ts$/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

describe("code that reaches the browser", () => {
  it("uses no regex lookbehind, which Safari before 16.4 cannot parse", () => {
    const offenders = CLIENT_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .map((path) => relative(ROOT, path))
      .filter((path) => !SERVER_ONLY.some((pattern) => pattern.test(path)))
      .flatMap((path) =>
        readFileSync(join(ROOT, path), "utf8")
          .split("\n")
          .flatMap((line, index) => (/\(\?<[=!]/.test(line) ? [`${path}:${index + 1}`] : [])),
      );
    expect(offenders).toEqual([]);
  });
});
