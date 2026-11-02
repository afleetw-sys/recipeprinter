import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALES,
  FONT_SCALE_LABELS,
  fontScaleVars,
  normalizeFontScale,
  type FontScale,
} from "@/lib/fontScale";
import { readPrintSettings, writePrintSettings } from "@/lib/printSettings";
import { packPrintHandoff, printHandoffUrl, readPrintHandoff } from "@/lib/printHandoff";
import { assemblePrintProject, projectContentFromMeta, type PrintLayoutSettings } from "@/lib/printProjects";
import type { ProjectMeta } from "@/lib/project";
import { lookFor, normalizeThemeLooks, withLook } from "@/lib/themeLooks";

describe("text size steps", () => {
  it("reads anything that is not a step as Normal", () => {
    for (const value of [undefined, null, 0, 1.15, 2, "1.2", Number.NaN, {}]) {
      expect(normalizeFontScale(value), String(value)).toBe(DEFAULT_FONT_SCALE);
    }
    for (const scale of FONT_SCALES) expect(normalizeFontScale(scale)).toBe(scale);
  });

  it("names every step in words, and leaves a Normal page's markup alone", () => {
    for (const scale of FONT_SCALES) expect(FONT_SCALE_LABELS[scale]).not.toMatch(/\d|%/);
    expect(fontScaleVars(DEFAULT_FONT_SCALE)).toBeUndefined();
    expect(fontScaleVars(1.2)).toEqual({ "--recipe-font-scale": 1.2 });
  });
});

// The text size has to survive every road a deck travels, or the cook picks
// Bigger and gets Normal somewhere else: the next visit, the Safari hand-off,
// the saved book (which is also what the PDF renderer is handed).
describe("text size travels with the deck", () => {
  const memory = new Map<string, string>();
  beforeEach(() => {
    memory.clear();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage, sessionStorage: storage },
    });
  });

  const stored = (fontScale: FontScale) => ({
    cardSize: "letter",
    template: "classic",
    doubleSided: true,
    showCutLines: false,
    showPhoto: true,
    showSourceUrl: true,
    themeLooks: withLook({}, "classic", { fontScale }),
  });

  it("is remembered on this device and carried in a hand-off link", () => {
    for (const scale of FONT_SCALES) {
      writePrintSettings(stored(scale));
      const fontScaleRead = () => {
        const settings = readPrintSettings();
        return lookFor(normalizeThemeLooks(settings?.themeLooks, settings ?? {}), "classic").fontScale;
      };
      expect(fontScaleRead()).toBe(scale);

      const link = printHandoffUrl(packPrintHandoff([], {} as ProjectMeta, new Map()), "https://example.test");
      const arrived = readPrintHandoff(link.slice(link.indexOf("#")));
      memory.clear();
      if (arrived?.settings) window.localStorage.setItem("recipeprinter:print-settings:v1", arrived.settings);
      expect(fontScaleRead(), `hand-off at ${scale}`).toBe(scale);
    }
  });

  it("is saved into the project the account and the PDF renderer read", () => {
    const meta = { cookbookMode: true } as unknown as ProjectMeta;
    for (const fontScale of FONT_SCALES) {
      const layout: PrintLayoutSettings = {
        cardSize: "letter",
        template: "classic",
        doubleSided: false,
        showPhoto: true,
        showSourceUrl: true,
        showCutLines: false,
        fontScale,
      };
      const project = assemblePrintProject({
        ...projectContentFromMeta(meta, layout),
        id: "p",
        ownerUid: "u",
        sections: [],
      });
      expect(normalizeFontScale(project.settings.fontScale)).toBe(fontScale);
      // Through JSON, which is what Firestore and the export payload both are.
      expect(normalizeFontScale(JSON.parse(JSON.stringify(project)).settings.fontScale)).toBe(fontScale);
    }
  });
});
