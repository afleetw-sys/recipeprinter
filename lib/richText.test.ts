import { describe, expect, it } from "vitest";
import {
  hasRichText,
  nodesToRichText,
  parseRichText,
  richTextToHtml,
  stripRichText,
  toggleRichText,
} from "./richText";

const runs = (s: string) =>
  parseRichText(s).map((r) => `${r.bold ? "b" : ""}${r.italic ? "i" : ""}:${r.text}`);

describe("parseRichText", () => {
  it("reads bold and italic", () => {
    expect(runs("**very** good")).toEqual(["b:very", ": good"]);
    expect(runs("*gently* fold")).toEqual(["i:gently", ": fold"]);
  });

  it("nests one inside the other", () => {
    expect(runs("**do *not* skip**")).toEqual(["b:do ", "bi:not", "b: skip"]);
  });

  it("leaves a lone asterisk alone", () => {
    expect(runs("2 * 3 cups")).toEqual([":2 * 3 cups"]);
    expect(stripRichText("2 * 3 cups")).toBe("2 * 3 cups");
  });

  it("leaves an unmatched marker as punctuation rather than swallowing the rest", () => {
    expect(stripRichText("*not closed")).toBe("*not closed");
    expect(stripRichText("**also not closed")).toBe("**also not closed");
  });

  it("does not open on a marker followed by a space", () => {
    expect(stripRichText("salt * pepper *")).toBe("salt * pepper *");
  });

  it("never drops characters", () => {
    for (const s of ["**a**", "*a*", "a**b**c", "***a***", "a * b", "", "*", "**"]) {
      expect(stripRichText(s).length).toBeLessThanOrEqual(s.length);
      expect(parseRichText(s).map((r) => r.text).join("")).toBe(stripRichText(s));
    }
  });
});

describe("stripRichText", () => {
  it("gives layout the text the reader actually sees", () => {
    // The pagination engine measures cost from this: counting `**` would make
    // a bolded line look wider than it prints.
    expect(stripRichText("**Preheat** the oven")).toBe("Preheat the oven");
  });
});

describe("hasRichText", () => {
  it("is false for ordinary text", () => {
    expect(hasRichText("2 cups flour")).toBe(false);
    expect(hasRichText("2 * 3")).toBe(false);
  });
  it("is true once something is formatted", () => {
    expect(hasRichText("**2** cups")).toBe(true);
  });
});

describe("toggleRichText", () => {
  it("wraps the selection and keeps it selected", () => {
    const out = toggleRichText("very good", 0, 4, "bold");
    expect(out.value).toBe("**very** good");
    expect(out.value.slice(out.selectionStart, out.selectionEnd)).toBe("very");
  });

  it("unwraps when the markers sit just outside the selection", () => {
    const out = toggleRichText("**very** good", 2, 6, "bold");
    expect(out.value).toBe("very good");
    expect(out.value.slice(out.selectionStart, out.selectionEnd)).toBe("very");
  });

  it("unwraps when the markers are inside the selection", () => {
    const out = toggleRichText("**very** good", 0, 8, "bold");
    expect(out.value).toBe("very good");
  });

  it("drops in an empty pair when nothing is selected, cursor between them", () => {
    const out = toggleRichText("salt", 4, 4, "italic");
    expect(out.value).toBe("salt**");
    expect(out.selectionStart).toBe(5);
    expect(out.selectionEnd).toBe(5);
  });

  it("italic and bold are independent", () => {
    const bolded = toggleRichText("word", 0, 4, "bold");
    const both = toggleRichText(bolded.value, bolded.selectionStart, bolded.selectionEnd, "italic");
    expect(stripRichText(both.value)).toBe("word");
    const parsed = parseRichText(both.value);
    expect(parsed.some((r) => r.bold && r.italic)).toBe(true);
  });
});

// A stand-in DOM, so the round trip is exercised in the node test env.
const t = (text: string) => ({ nodeType: 3, nodeName: "#text", textContent: text });
const el = (nodeName: string, ...childNodes: any[]) => ({ nodeType: 1, nodeName, childNodes });

describe("nodesToRichText (contentEditable → stored markers)", () => {
  it("reads the tags a browser actually produces", () => {
    expect(nodesToRichText(el("DIV", el("B", t("very")), t(" good")))).toBe("**very** good");
    expect(nodesToRichText(el("DIV", el("STRONG", t("very")), t(" good")))).toBe("**very** good");
    expect(nodesToRichText(el("DIV", el("I", t("gently"))))).toBe("*gently*");
    expect(nodesToRichText(el("DIV", el("EM", t("gently"))))).toBe("*gently*");
  });

  it("merges runs a browser split across sibling elements", () => {
    // execCommand cheerfully produces <b>a</b><b>b</b>; storing that as
    // "**a****b**" would round-trip into visible asterisks.
    expect(nodesToRichText(el("DIV", el("B", t("a")), el("B", t("b"))))).toBe("**ab**");
  });

  it("handles nesting both ways round", () => {
    expect(nodesToRichText(el("DIV", el("B", el("I", t("x")))))).toBe("**_x_**".replace(/_/g, "*"));
    expect(nodesToRichText(el("DIV", el("I", el("B", t("x")))))).toBe("*_x_*".replace(/_/g, "**"));
  });

  it("keeps the text of markup it does not understand, and none of the markup", () => {
    expect(nodesToRichText(el("DIV", el("SPAN", el("A", t("pasted")))))).toBe("pasted");
  });

  it("turns a line break into a newline", () => {
    expect(nodesToRichText(el("DIV", t("a"), el("BR"), t("b")))).toBe("a\nb");
  });

  it("closes every open run at the end", () => {
    expect(nodesToRichText(el("DIV", el("B", t("unfinished"))))).toBe("**unfinished**");
  });
});

describe("richTextToHtml (stored markers → contentEditable)", () => {
  it("emits only the three elements it is allowed to", () => {
    expect(richTextToHtml("**a** *b*")).toBe("<strong>a</strong> <em>b</em>");
  });

  it("escapes text so recipe content cannot inject markup", () => {
    expect(richTextToHtml("1 < 2 & 3 > 0")).toBe("1 &lt; 2 &amp; 3 &gt; 0");
    expect(richTextToHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("round-trips through the DOM shape it produces", () => {
    const source = "**5 lbs** rump roast, *trimmed*";
    // <strong>5 lbs</strong> rump roast, <em>trimmed</em>
    const dom = el(
      "DIV",
      el("STRONG", t("5 lbs")),
      t(" rump roast, "),
      el("EM", t("trimmed")),
    );
    expect(richTextToHtml(source)).toBe(
      "<strong>5 lbs</strong> rump roast, <em>trimmed</em>",
    );
    expect(nodesToRichText(dom)).toBe(source);
  });

  it("leaves a literal asterisk alone in both directions", () => {
    expect(richTextToHtml("2 * 3")).toBe("2 * 3");
    expect(nodesToRichText(el("DIV", t("2 * 3")))).toBe("2 * 3");
  });
});

describe("what browsers actually emit", () => {
  it("reads Chrome's execCommand output, which is <b> beside our own <strong>", () => {
    // Verified in a real Chrome: seeding "<strong>5 lbs</strong> rump roast"
    // and bolding "rump" yields "<strong>5 lbs</strong> <b>rump</b> roast".
    const dom = el(
      "DIV",
      el("STRONG", t("5 lbs")),
      t(" "),
      el("B", t("rump")),
      t(" roast"),
    );
    expect(nodesToRichText(dom)).toBe("**5 lbs** **rump** roast");
  });

  it("survives the wrapper divs a browser leaves behind on Enter", () => {
    expect(nodesToRichText(el("DIV", el("DIV", t("a")), el("DIV", t("b"))))).toBe("ab");
  });
});
