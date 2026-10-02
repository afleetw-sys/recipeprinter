import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The browser-test and layout-sweep jobs run in Playwright's own Docker image,
// which carries the browsers for exactly one Playwright version. If the
// lockfile moves on without the image (a Dependabot bump, an `npm update`),
// every browser test fails with "Executable doesn't exist" and nothing says
// why. Bump the image tag in .github/workflows alongside the package.

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const pinned: string = lock.packages["node_modules/playwright"].version;

describe("Playwright's CI image", () => {
  it("matches the Playwright version the lockfile installs", () => {
    const images = readdirSync(".github/workflows")
      .filter((name) => name.endsWith(".yml"))
      .flatMap((name) => {
        const text = readFileSync(join(".github/workflows", name), "utf8");
        return Array.from(text.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)/g), (m) => ({ name, version: m[1] }));
      });
    expect(images.length, "no workflow uses the Playwright image").toBeGreaterThan(0);
    for (const image of images) expect(image.version, image.name).toBe(pinned);
  });
});
