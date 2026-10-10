"use client";

import { useEffect, useSyncExternalStore } from "react";
import { onCookPilotSignedInChange, readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";
import {
  clearImportsUnlimited,
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
  // The server render and the first client render both see "no count, not
  // unlimited" (the third argument), so the line is in the page's HTML from the
  // start, stating the allowance, and never pops in after the scripts load.
  // What this browser remembers is swapped into that same line straight after.
  const remembered = useSyncExternalStore(subscribeImportUsage, rememberedImportUsage, () => null);
  const unlimited = useSyncExternalStore(subscribeImportUsage, importsKnownUnlimited, () => false);

  useEffect(() => {
    if (!active) return;
    // A known Pro member has no count to fetch.
    if (!importsKnownUnlimited() && (rememberedImportUsage() || readCookPilotWasSignedIn())) {
      void refreshImportUsage();
    }
    // Signing in or out changes whose count this is. Signing out also ends
    // "unlimited": that belonged to the account, not to this browser.
    return onCookPilotSignedInChange((signedIn) => {
      if (!signedIn) clearImportsUnlimited();
      void refreshImportUsage();
    });
  }, [active]);

  if (!active || unlimited) return { hidden: true, usage: null };
  return { hidden: false, usage: remembered ? usageNow(remembered, Date.now()) : null };
}
