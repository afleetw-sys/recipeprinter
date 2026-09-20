import { describe, expect, it } from "vitest";
import {
  initialPrintCardSize,
  initialRecipePrintTemplate,
  isPrintCardSize,
  isRecipePrintTemplate,
} from "@/lib/printSettings";

// These read the ?size= and ?template= query params when the print page
// mounts. An unknown value must fall back rather than reach the preview, since
// a bogus size would render a card the layout engine has no dimensions for.
describe("initialPrintCardSize", () => {
  it("accepts every size the page offers", () => {
    expect(initialPrintCardSize("letter")).toBe("letter");
    expect(initialPrintCardSize("card-6x4")).toBe("card-6x4");
  });

  it("falls back to letter for a missing or unknown value", () => {
    expect(initialPrintCardSize(null)).toBe("letter");
    expect(initialPrintCardSize("6x4")).toBe("letter");
    expect(initialPrintCardSize("")).toBe("letter");
  });

  it("agrees with the guard it is built on", () => {
    expect(isPrintCardSize("card-6x4")).toBe(true);
    expect(isPrintCardSize("6x4")).toBe(false);
  });
});

describe("initialRecipePrintTemplate", () => {
  it("accepts a known template", () => {
    expect(initialRecipePrintTemplate("heirloom")).toBe("heirloom");
  });

  it("falls back to classic for a missing or unknown value", () => {
    expect(initialRecipePrintTemplate(null)).toBe("classic");
    expect(initialRecipePrintTemplate("not-a-template")).toBe("classic");
  });

  it("agrees with the guard it is built on", () => {
    expect(isRecipePrintTemplate("classic")).toBe(true);
    expect(isRecipePrintTemplate("not-a-template")).toBe(false);
  });
});
