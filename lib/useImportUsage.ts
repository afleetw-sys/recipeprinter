"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";
import {
  importsKnownUnlimited,
  refreshImportUsage,
  rememberedImportUsage,
  subscribeImportUsage,
  usageNow,
  type ImportUsage,
} from "@/lib/importMeter";

/**
 * The cook's free-import count for an import box to show, or what to show in
 * its place: `hidden` when the allowance isn't live or doesn't apply to them.
 *
 * The number is the server's. It is read from what the server last told this
 * browser, and asked for again once per mount when there is reason to think it
 * could be stale or missing: this browser has imported before, or has been
 * signed in (an account's imports may have been made on another device). A
 * first-time visitor makes no request at all and sees the allowance stated.
 */
export function useImportUsage(enabled: boolean = true): { hidden: boolean; usage: ImportUsage | null } {
  const active = IMPORT_ALLOWANCE_LIVE && enabled;
  const remembered = useSyncExternalStore(subscribeImportUsage, rememberedImportUsage, () => null);
  const unlimited = useSyncExternalStore(subscribeImportUsage, importsKnownUnlimited, () => false);
  // Nothing on the server render or the first client one: the count lives in
  // this browser, and showing it a frame late beats a hydration mismatch.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!active) return;
    if (rememberedImportUsage() || importsKnownUnlimited() || readCookPilotWasSignedIn()) void refreshImportUsage();
  }, [active]);

  if (!active || !mounted || unlimited) return { hidden: true, usage: null };
  return { hidden: false, usage: remembered ? usageNow(remembered, Date.now()) : null };
}
