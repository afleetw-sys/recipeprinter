"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { localStore } from "@/lib/storage";

// SSR renders with the default (no localStorage), so the first client render
// must match it — but we still want the stored size applied BEFORE paint, not a
// frame later, so the preview never commits a default-size layout that the size
// selector then disagrees with. A layout effect flips it before the browser
// paints (after the SSR-matching first render), falling back to a passive effect
// on the server where layout effects don't run.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Layout preferences carry over across visits (device-local, no account/sync)
// so going back to add another recipe doesn't reset the print setup. Shared
// with the /print/[slug] loader, which seeds these from a sharedRecipeCards
// doc before handing off to the real /print page.
export const PRINT_SETTINGS_STORAGE_KEY = "recipeprinter:print-settings:v1";

export interface StoredPrintSettings {
  cardSize?: string;
  template?: string;
  doubleSided?: boolean;
  showCutLines?: boolean;
  showPhoto?: boolean;
  showSourceUrl?: boolean;
}

export function readPrintSettings(): StoredPrintSettings | null {
  const parsed = localStore.getJson<StoredPrintSettings>(PRINT_SETTINGS_STORAGE_KEY);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function writePrintSettings(settings: Required<StoredPrintSettings>) {
  // Survivable if it fails: settings stay correct for this session, they just
  // won't carry over to the next visit.
  localStore.setJson(PRINT_SETTINGS_STORAGE_KEY, settings);
}

export function isPrintCardSize(value: string | null): value is PrintCardSize {
  return PRINT_CARD_SIZE_OPTIONS.some((option) => option.id === value);
}

export function isRecipePrintTemplate(value: string | null): value is RecipePrintTemplate {
  return RECIPE_PRINT_TEMPLATE_OPTIONS.some((option) => option.id === value);
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
  showPhoto: boolean;
  setShowPhoto: (value: boolean) => void;
  showSourceUrl: boolean;
  setShowSourceUrl: (value: boolean) => void;
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
    showPhoto,
    setShowPhoto,
    showSourceUrl,
    setShowSourceUrl,
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
    if (typeof stored.showPhoto === "boolean") setShowPhoto(stored.showPhoto);
    if (typeof stored.showSourceUrl === "boolean") setShowSourceUrl(stored.showSourceUrl);
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
      showPhoto,
      showSourceUrl,
    });
  }, [cardSize, template, doubleSided, showCutLines, showPhoto, showSourceUrl]);
}
