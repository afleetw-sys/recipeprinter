"use client";

import { useEffect } from "react";
import { rememberedImportUsage } from "@/lib/importMeter";
import { IMPORT_LIMIT_TRIGGER, proUpgradeCopy } from "@/lib/proUpgradeCopy";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * The Pro upgrade dialog for the free-import count on pages with no editor
 * (the homepage, the SEO pages): the same dialog and checkout `/print` opens,
 * through `useStandaloneProUpgrade`, so Upgrade never sends anyone off to a
 * different page. Mounted only once it is needed, so the banner costs nothing
 * until then; `openSignal` reopens it on each later press.
 *
 * `spent` is someone who is out of imports: they get the allowance's own
 * wording ("You've used your 10 free imports"), as on `/print`. Anyone else
 * pressed Upgrade and gets the plain Pro dialog.
 */
export function ImportBannerUpgrade({ openSignal, spent = false }: { openSignal: number; spent?: boolean }) {
  const { openProUpgrade, proUpgradeDialog, proMessage } = useStandaloneProUpgrade(
    spent ? IMPORT_LIMIT_TRIGGER : "import_banner",
    spent ? proUpgradeCopy([], IMPORT_LIMIT_TRIGGER, rememberedImportUsage()) : undefined,
  );
  useEffect(() => {
    openProUpgrade();
  }, [openSignal, openProUpgrade]);

  return (
    <>
      {proUpgradeDialog}
      {proMessage && (
        <p className="mt-cp-1 text-cp-caption text-ink-soft" role="status">
          {proMessage}
        </p>
      )}
    </>
  );
}
