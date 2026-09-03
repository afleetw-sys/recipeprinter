import { describe, expect, it } from "vitest";
import { hasRichText, parseRichText, stripRichText, toggleRichText } from "./richText";

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
