import { describe, expect, it } from "vitest";
import { demoteSectionToLine, promoteLineToSection } from "@/lib/useRecipeInlineEditor";

type Row = { name: string; section?: string };

const rows = (...names: Array<[string, string?]>): Row[] =>
  names.map(([name, section]) => (section === undefined ? { name } : { name, section }));

describe("promoteLineToSection", () => {
  it("removes the line and titles the run that followed it", () => {
    const next = promoteLineToSection(rows(["flour"], ["salt"], ["For the glaze"], ["sugar"]), 2, "For the glaze");
    expect(next).toEqual(rows(["flour"], ["salt"], ["sugar", "For the glaze"]));
  });

  it("stops at the next section, leaving later groups alone", () => {
    const next = promoteLineToSection(
      rows(["flour"], ["Topping"], ["butter"], ["nuts", "Sauce"]),
      1,
      "Topping",
    );
    expect(next).toEqual(rows(["flour"], ["butter", "Topping"], ["nuts", "Sauce"]));
  });

  it("splits the group it was sitting in rather than retitling the whole thing", () => {
    const next = promoteLineToSection(
      rows(["a", "Base"], ["Middle", "Base"], ["b", "Base"]),
      1,
      "Middle",
    );
    expect(next).toEqual(rows(["a", "Base"], ["b", "Middle"]));
  });

  /* The bug this replaces: promoting the LAST line deleted it and left the
     title nowhere to live, so the text just typed disappeared off the card. */
  it("keeps the heading when it ends the list, on an empty row", () => {
    const next = promoteLineToSection(
      rows(["flour"], ["Glaze"]),
      1,
      "Glaze",
      (section) => ({ name: "", section }),
    );
    expect(next).toEqual(rows(["flour"], ["", "Glaze"]));
  });

  it("still drops the line when no empty row can be built for it", () => {
    expect(promoteLineToSection(rows(["flour"], ["Glaze"]), 1, "Glaze")).toEqual(rows(["flour"]));
  });
});

describe("demoteSectionToLine", () => {
  const make = (name: string, section?: string): Row => (section === undefined ? { name } : { name, section });

  it("puts the title back as a row and clears the run", () => {
    const { items, title } = demoteSectionToLine(rows(["flour"], ["sugar", "For the glaze"]), 1, make);
    expect(title).toBe("For the glaze");
    expect(items).toEqual(rows(["flour"], ["For the glaze"], ["sugar"]));
  });

  it("rejoins the group above, not the top level", () => {
    const { items } = demoteSectionToLine(
      rows(["a", "Base"], ["b", "Glaze"], ["c", "Other"]),
      1,
      make,
    );
    expect(items).toEqual(rows(["a", "Base"], ["Glaze", "Base"], ["b", "Base"], ["c", "Other"]));
  });

  it("round-trips with promote", () => {
    const start = rows(["flour"], ["salt"], ["sugar", "For the glaze"]);
    const { items, title } = demoteSectionToLine(start, 2, make);
    expect(promoteLineToSection(items, 2, title)).toEqual(start);
  });
});
