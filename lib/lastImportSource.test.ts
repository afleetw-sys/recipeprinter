import { describe, expect, it } from "vitest";
import { normalizeProjectMeta } from "@/lib/project";

/* Which source the Add-recipe dialog opens on is read straight out of storage
   and handed to the import panel as the tab to show. A value that is not one of
   the four leaves the panel with a tab strip and nothing under it, so the
   normalization is the only thing standing between a corrupted key and an
   Add-recipe dialog with no form in it. */
describe("the source a project was last filled from", () => {
  it("survives the normalization a reopened project passes through", () => {
    expect(normalizeProjectMeta({ sections: [], lastImportSource: "text" }).lastImportSource).toBe(
      "text",
    );
  });

  it("reads as Link when the stored value is not a source at all", () => {
    expect(
      normalizeProjectMeta({ sections: [], lastImportSource: "paprika" }).lastImportSource,
    ).toBeUndefined();
    expect(normalizeProjectMeta({ sections: [], lastImportSource: 3 }).lastImportSource).toBeUndefined();
  });

  it("is absent on a project that never had one", () => {
    expect(normalizeProjectMeta({ sections: [] }).lastImportSource).toBeUndefined();
  });
});
