import { describe, expect, it } from "vitest";
import type { PrintLayoutSettings } from "@/lib/printProjects";
import type { ProjectMeta } from "@/lib/project";
import { printProjectFingerprint, SAVE_TIMEOUT_MS } from "@/lib/printSave";

const layout: PrintLayoutSettings = {
  cardSize: "letter",
  template: "classic",
  doubleSided: false,
  showPhoto: true,
  showSourceUrl: true,
  showDescription: true,
  showCutLines: false,
};

// Only the identity of the object matters to the fingerprint, not its shape.
const meta = { projectId: "p1" } as unknown as ProjectMeta;

describe("printProjectFingerprint", () => {
  it("is stable for the same inputs", () => {
    expect(printProjectFingerprint(null, meta, layout)).toBe(
      printProjectFingerprint(null, meta, { ...layout }),
    );
  });

  it("changes when any single layout setting changes", () => {
    const base = printProjectFingerprint(null, meta, layout);
    const flips: Array<Partial<PrintLayoutSettings>> = [
      { cardSize: "card-6x4" },
      { template: "heirloom" },
      { doubleSided: true },
      { showPhoto: false },
      { showSourceUrl: false },
      { showDescription: false },
      { showCutLines: true },
    ];
    for (const change of flips) {
      expect(printProjectFingerprint(null, meta, { ...layout, ...change })).not.toBe(base);
    }
  });

  it("changes when the items or the meta change", () => {
    const base = printProjectFingerprint(null, meta, layout);
    expect(printProjectFingerprint([], meta, layout)).not.toBe(base);
    expect(
      printProjectFingerprint(null, { projectId: "p2" } as unknown as ProjectMeta, layout),
    ).not.toBe(base);
  });

  it("treats a missing showDescription like an undefined one, not like false", () => {
    const { showDescription: _omit, ...withoutDescription } = layout;
    void _omit;
    expect(printProjectFingerprint(null, meta, withoutDescription)).not.toBe(
      printProjectFingerprint(null, meta, { ...layout, showDescription: false }),
    );
  });
});

describe("SAVE_TIMEOUT_MS", () => {
  it("stays generous enough for a big book on a slow phone", () => {
    // A write cut short costs a redundant write and possibly a conflict prompt,
    // so lowering this is a behavior change, not a tidy-up.
    expect(SAVE_TIMEOUT_MS).toBe(45_000);
  });
});
