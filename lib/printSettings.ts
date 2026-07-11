"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";

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
  cardsPerSheet?: number;
}

export function readPrintSettings(): StoredPrintSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredPrintSettings) : null;
  } catch {
    return null;
  }
}

export function writePrintSettings(settings: Required<StoredPrintSettings>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage may be unavailable (private mode); settings stay in memory */
  }
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
  cardsPerSheet: 1 | 2;
  setCardsPerSheet: (value: 1 | 2) => void;
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
    cardsPerSheet,
    setCardsPerSheet,
  } = state;

  // Hydrate stored layout preferences on mount (client only). Explicit URL
  // params (for deep links) still win over whatever was last saved.
  useEffect(() => {
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
    if (stored.cardsPerSheet === 1 || stored.cardsPerSheet === 2) setCardsPerSheet(stored.cardsPerSheet);
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
      cardsPerSheet,
    });
  }, [cardSize, template, doubleSided, showCutLines, showPhoto, showSourceUrl, cardsPerSheet]);
}
