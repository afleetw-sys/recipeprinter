"use client";

import { localStore } from "@/lib/storage";
import type { ExportOutput } from "@/types/export";

/**
 * What the Print split button's main half does: whichever of Print, PDF, PNG
 * and JPG the cook used last, so the thing they do every time is one press.
 *
 * Kept in this browser, not on the account. It is a habit of a device (a
 * printer at the desk, pictures on the phone), and reading an account before
 * drawing the page's main button would make it change under the pointer.
 */
export type PrintPrimaryAction = "print" | ExportOutput;

const KEY = "recipeprinter:print-primary-action:v1";
const ACTIONS: readonly PrintPrimaryAction[] = ["print", "pdf", "png", "jpg"];

export const PRINT_ACTION_LABEL: Record<ExportOutput, string> = { pdf: "PDF", png: "PNG", jpg: "JPG" };

export function readPrintPrimaryAction(): PrintPrimaryAction {
  const stored = localStore.get(KEY);
  return ACTIONS.find((action) => action === stored) ?? "print";
}

export function rememberPrintPrimaryAction(action: PrintPrimaryAction): void {
  localStore.set(KEY, action);
}
