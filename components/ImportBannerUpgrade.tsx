"use client";

import { useEffect } from "react";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * The Pro upgrade dialog for the free-import banner on pages with no editor
 * (the homepage, the SEO pages): the same dialog and checkout `/print` opens,
 * through `useStandaloneProUpgrade`, so Upgrade never sends anyone off to a
 * different page. Mounted only once Upgrade has been pressed, so the banner
 * costs nothing until then; `openSignal` reopens it on each later press.
 */
export function ImportBannerUpgrade({ openSignal }: { openSignal: number }) {
  const { openProUpgrade, proUpgradeDialog, proMessage } = useStandaloneProUpgrade("import_banner");
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
