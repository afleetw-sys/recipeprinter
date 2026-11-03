"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { PRINT_CARD_SIZE_OPTIONS, RECIPE_PRINT_TEMPLATE_OPTIONS } from "@/lib/printTemplates";
import { normalizeThemeLooks, type ThemeLooks } from "@/lib/themeLooks";
import type { PrintCardSize, RecipePrintTemplate } from "@/types/recipe";

// SSR renders with the default (no localStorage), so the first client render
// must match it — but we still want the stored size applied BEFORE paint, not a
// frame later, so the preview never commits a default-size layout that the size
// selector then disagrees with. A layout effect flips it before the browser
// paints (after the SSR-matching first render), falling back to a passive effect
// on the server where layout effects don't run.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

import { localStore } from "@/lib/storage";

/*
 * The storage half lived in lib/printSettingsStore from 2026-08 until
 * 2026-09-12, split off so a module that only needs to READ stored settings did
 * not have to pull in the validators below — they compare against the option
 * tables, which lived in components/RecipeCardPrint, which is the entire
 * ~2,100-line printable-card component tree. lib/localProjects reads these while
 * filing a book from the HOMEPAGE, where that tree is otherwise absent from the
 * bundle entirely.
 *
 * The tables are plain data in lib/printTemplates now, so the validators cost
 * two small arrays and the split has nothing left to protect. One module again.
 */

// Layout preferences carry over across visits (device-local, no account/sync)
// so going back to add another recipe doesn't reset the print setup.
export const PRINT_SETTINGS_STORAGE_KEY = "recipeprinter:print-settings:v1";

export interface StoredPrintSettings {
  cardSize?: string;
  template?: string;
  doubleSided?: boolean;
  showCutLines?: boolean;
  /** 4x6 cards print two to a Letter sheet. Kept on the device, not in a
      saved project: it describes the paper in this person's printer, not
      the recipes. */
  twoPerSheet?: boolean;
  showPhoto?: boolean;
  showSourceUrl?: boolean;
  /** One text size for every theme, from before each theme kept its own.
      Read once, into `themeLooks`, and never written again. */
  fontScale?: number;
  themeLooks?: ThemeLooks;
}

/**
 * The recipe link is stored as `showRecipeLink`, not `showSourceUrl`.
 *
 * The link used to default off, and every change to any setting wrote the
 * whole object back, so nearly every returning browser holds a
 * `showSourceUrl: false` it never chose. When the default became on
 * (2026-09-29) the old field was left unread rather than trusted, so the new
 * default reaches those browsers too. Anyone who turns the link off from here
 * on is remembered under the new name.
 */
type StoredOnDisk = Omit<StoredPrintSettings, "showSourceUrl"> & {
  showSourceUrl?: unknown;
  showRecipeLink?: boolean;
};

export function readPrintSettings(): StoredPrintSettings | null {
  const parsed = localStore.getJson<StoredOnDisk>(PRINT_SETTINGS_STORAGE_KEY);
  if (!parsed || typeof parsed !== "object") return null;
  const { showSourceUrl: _legacy, showRecipeLink, ...rest } = parsed;
  return typeof showRecipeLink === "boolean" ? { ...rest, showSourceUrl: showRecipeLink } : rest;
}

export function writePrintSettings(
  settings: Required<Omit<StoredPrintSettings, "fontScale" | "twoPerSheet">> &
    Pick<StoredPrintSettings, "twoPerSheet">,
) {
  const { showSourceUrl, ...rest } = settings;
  // A writer that does not know about two-per-sheet (a shared card link
  // seeding its own look) leaves this device's paper choice as it was.
  const twoPerSheet = settings.twoPerSheet ?? readPrintSettings()?.twoPerSheet;
  // Survivable if it fails: settings stay correct for this session, they just
  // won't carry over to the next visit.
  const onDisk: StoredOnDisk = {
    ...rest,
    ...(twoPerSheet === undefined ? {} : { twoPerSheet }),
    showRecipeLink: showSourceUrl,
  };
  localStore.setJson(PRINT_SETTINGS_STORAGE_KEY, onDisk);
}

export function isPrintCardSize(value: string | null): value is PrintCardSize {
  return PRINT_CARD_SIZE_OPTIONS.some((option) => option.id === value);
}

export function isRecipePrintTemplate(value: string | null): value is RecipePrintTemplate {
  return RECIPE_PRINT_TEMPLATE_OPTIONS.some((option) => option.id === value);
}

export function initialPrintCardSize(value: string | null): PrintCardSize {
  return isPrintCardSize(value) ? value : "letter";
}

export function initialRecipePrintTemplate(value: string | null): RecipePrintTemplate {
  return isRecipePrintTemplate(value) ? value : "document";
}

interface PrintSettingsState {
  cardSize: PrintCardSize;
  setCardSize: (value: PrintCardSize) => void;
  template: RecipePrintTemplate;
  setTemplate: (value: RecipePrintTemplate) => void;
  doubleSided: boolean;
  setDoubleSided: (value: boolean) => void;
  showCutLines: boolean;
  setShowCutLines: (value: boolean) => void;
  twoPerSheet: boolean;
  setTwoPerSheet: (value: boolean) => void;
  showPhoto: boolean;
  setShowPhoto: (value: boolean) => void;
  showSourceUrl: boolean;
  setShowSourceUrl: (value: boolean) => void;
  themeLooks: ThemeLooks;
  setThemeLooks: (value: ThemeLooks) => void;
}

/**
 * Hydrates print-layout preferences from localStorage on mount — explicit URL
 * params (for deep links) still win over whatever was last saved — then
 * persists them on every change thereafter.
 */
export function usePrintSettingsPersistence(
  params: ReadonlyURLSearchParams,
  state: PrintSettingsState,
) {
  const didMountRef = useRef(false);
  const {
    cardSize,
    setCardSize,
    template,
    setTemplate,
    doubleSided,
    setDoubleSided,
    showCutLines,
    setShowCutLines,
    twoPerSheet,
    setTwoPerSheet,
    showPhoto,
    setShowPhoto,
    showSourceUrl,
    setShowSourceUrl,
    themeLooks,
    setThemeLooks,
  } = state;

  // Hydrate stored layout preferences on mount (client only). Explicit URL
  // params (for deep links) still win over whatever was last saved. Runs as a
  // layout effect so the stored size lands before the first painted frame — see
  // useIsomorphicLayoutEffect above.
  useIsomorphicLayoutEffect(() => {
    const stored = readPrintSettings();
    if (!stored) return;
    if (!params.get("size") && stored.cardSize && isPrintCardSize(stored.cardSize)) {
      setCardSize(stored.cardSize);
    }
    if (!params.get("template") && stored.template && isRecipePrintTemplate(stored.template)) {
      setTemplate(stored.template);
    }
    if (typeof stored.doubleSided === "boolean") setDoubleSided(stored.doubleSided);
    if (typeof stored.showCutLines === "boolean") setShowCutLines(stored.showCutLines);
    if (typeof stored.twoPerSheet === "boolean") setTwoPerSheet(stored.twoPerSheet);
    if (typeof stored.showPhoto === "boolean") setShowPhoto(stored.showPhoto);
    if (typeof stored.showSourceUrl === "boolean") setShowSourceUrl(stored.showSourceUrl);
    if (stored.themeLooks !== undefined || stored.fontScale !== undefined) {
      setThemeLooks(normalizeThemeLooks(stored.themeLooks, stored));
    }
    // Runs once on mount; the settings above are the ones being hydrated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist layout preferences whenever they change. Skip the very first run
  // so this doesn't clobber a stored value with defaults before the hydration
  // effect above has a chance to apply it.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    writePrintSettings({
      cardSize,
      template,
      doubleSided,
      showCutLines,
      twoPerSheet,
      showPhoto,
      showSourceUrl,
      themeLooks,
    });
  }, [cardSize, template, doubleSided, showCutLines, twoPerSheet, showPhoto, showSourceUrl, themeLooks]);
}
