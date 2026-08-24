import { describe, expect, it } from "vitest";
import { stripCssComments, stripJsComments } from "./stripComments.mjs";

/** Line count and line breaks must survive, or reported line numbers drift. */
function sameShape(before, after) {
  return (
    before.length === after.length &&
    before.split("\n").length === after.split("\n").length
  );
}

describe("stripCssComments", () => {
  it("blanks a block comment without moving anything after it", () => {
    const css = `.a { color: red; } /* note */ .b { color: blue; }`;
    const out = stripCssComments(css);
    expect(out).toContain(".a { color: red; }");
    expect(out).toContain(".b { color: blue; }");
    expect(out).not.toContain("note");
    expect(sameShape(css, out)).toBe(true);
  });

  // The exact failure that made the audit red: a comment explaining a
  // declaration read as the declaration.
  it("hides a declaration quoted inside a comment", () => {
    const css = [
      "/* Collapses to an icon: `font-size: 0` hides the label but the label",
      "   is still a bare text node. */",
      ".x { font-size: var(--cp-fs-body); }",
    ].join("\n");
    const out = stripCssComments(css);
    expect(out.split("\n")[0]).not.toContain("font-size");
    expect(out.split("\n")[2]).toContain("font-size: var(--cp-fs-body)");
    expect(sameShape(css, out)).toBe(true);
  });

  it("keeps multi-line comments spanning the lines they spanned", () => {
    const css = "/* one\n   two\n   three */\n.x { color: red; }";
    const out = stripCssComments(css);
    expect(out.split("\n")).toHaveLength(4);
    expect(out.split("\n")[3]).toBe(".x { color: red; }");
  });

  it("leaves // alone, because CSS has no line comments and does have URLs", () => {
    const css = `@import url("https://fonts.googleapis.com/css2?family=X");`;
    expect(stripCssComments(css)).toBe(css);
  });
});

describe("stripJsComments", () => {
  it("blanks line comments, whole-line and trailing", () => {
    const js = ["// a note about shadow-lg", 'const a = 1; // and text-[13px]'].join("\n");
    const out = stripJsComments(js);
    expect(out).not.toContain("shadow-lg");
    expect(out).not.toContain("text-[13px]");
    expect(out).toContain("const a = 1;");
    expect(sameShape(js, out)).toBe(true);
  });

  it("blanks JSX block comments", () => {
    const js = `<div /* uses shadow-md */ className="p-2" />`;
    const out = stripJsComments(js);
    expect(out).not.toContain("shadow-md");
    expect(out).toContain('className="p-2"');
  });

  // The reason this needed a state machine rather than a regex.
  it("does not mistake a URL in a string for a comment", () => {
    const js = `const href = "https://example.com"; const cls = "text-[13px]";`;
    const out = stripJsComments(js);
    expect(out).toBe(js);
  });

  // app/print/[slug]/page.tsx really contains /^https?:\/\//i — a naive
  // stripper blanks the rest of that line and hides whatever follows.
  it("does not mistake // inside a regex literal for a comment", () => {
    const js = `const ok = /^https?:\\/\\//i.test(url) && cls === "text-[13px]";`;
    const out = stripJsComments(js);
    expect(out).toBe(js);
    expect(out).toContain("text-[13px]");
  });

  it("handles a regex containing a slash inside a character class", () => {
    const js = `const re = /[/]/; const cls = "shadow-lg";`;
    expect(stripJsComments(js)).toBe(js);
  });

  it("still treats a slash after a value as division", () => {
    const js = `const ratio = width / height; // shadow-lg`;
    const out = stripJsComments(js);
    expect(out).toContain("width / height");
    expect(out).not.toContain("shadow-lg");
  });

  it("leaves violations inside template literals visible", () => {
    const js = "const cls = `flex ${on ? 'text-[13px]' : ''}`;";
    expect(stripJsComments(js)).toBe(js);
  });

  it("does not start a comment inside a string", () => {
    const js = `const s = "/* not a comment */"; const cls = "shadow-xl";`;
    expect(stripJsComments(js)).toBe(js);
  });

  it("survives an unterminated block comment", () => {
    const js = "const a = 1;\n/* shadow-lg and on forever";
    const out = stripJsComments(js);
    expect(out).toContain("const a = 1;");
    expect(out).not.toContain("shadow-lg");
    expect(sameShape(js, out)).toBe(true);
  });

  it("blanks a line comment that ends the file without a newline", () => {
    const js = "const a = 1; // shadow-lg";
    expect(stripJsComments(js)).not.toContain("shadow-lg");
  });
});
