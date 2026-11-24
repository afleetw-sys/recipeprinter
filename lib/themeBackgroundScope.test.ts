import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const printCss = readFileSync(join(process.cwd(), "app/print/print.css"), "utf8");
const rule = printCss.match(/\.recipe-background-off\.recipe-page-deck[\s\S]*?\{[\s\S]*?background: #fff !important;\s*\}/)?.[0] ?? "";

describe("theme background scope", () => {
  it("whitens preview and print cards without whitening theme thumbnails", () => {
    expect(rule).toContain(".recipe-background-off .recipe-page-deck .recipe-card");
    expect(rule).toContain(".recipe-background-off .rp-twoup .recipe-card");
    expect(rule).not.toContain("recipe-template-option");
    expect(printCss).not.toContain(".recipe-background-off .recipe-card {");
  });
});
