import { describe, expect, it } from "vitest";
import {
  demoteSectionToLine,
  promoteLineToSection,
  sectionForInsertion,
} from "@/lib/useRecipeInlineEditor";

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

describe("sectionForInsertion", () => {
  // "Add below row N" inserts at N + 1, which is how every caller addresses it.
  const below = (items: Row[], row: number) => sectionForInsertion(items, row + 1);

  it("keeps the last line of a section in that section", () => {
    // The bug this exists for: two sections, Add below the second (last)
    // ingredient of the first one. The row being pushed down is the next
    // section's first line, and the new line used to join it.
    const items = rows(["olives", "Chermoula"], ["cumin", "Chermoula"], ["phyllo", "Pastry"]);
    expect(below(items, 1)).toBe("Chermoula");
  });

  it("stays in the run when inserting mid-section", () => {
    const items = rows(["olives", "Chermoula"], ["cumin", "Chermoula"], ["phyllo", "Pastry"]);
    expect(below(items, 0)).toBe("Chermoula");
  });

  it("keeps an unlabeled opening run unlabeled at its boundary", () => {
    // A recipe whose first heading comes late starts with rows carrying no
    // section at all. Adding below the last of them must not join the heading
    // underneath — so an absent section on the row above is an answer, not a
    // reason to look further down.
    const items = rows(["flour"], ["salt"], ["sugar", "For the glaze"]);
    expect(below(items, 1)).toBeUndefined();
  });

  it("appends to the last section at the end of the list", () => {
    const items = rows(["flour"], ["sugar", "For the glaze"]);
    expect(below(items, 1)).toBe("For the glaze");
  });

  it("takes the row below only when nothing is above it", () => {
    const items = rows(["sugar", "For the glaze"]);
    expect(sectionForInsertion(items, 0)).toBe("For the glaze");
  });

  it("has no section to give for an empty list", () => {
    expect(sectionForInsertion([] as Row[], 0)).toBeUndefined();
  });
});
