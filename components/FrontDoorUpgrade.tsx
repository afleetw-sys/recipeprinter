"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { CrownIcon, ICON_SIZE } from "@/components/icons";
import {
  importsKnownUnlimited,
  rememberedImportUsage,
  subscribeImportRefusal,
  subscribeImportUsage,
} from "@/lib/importMeter";

/**
 * The header's Pro control on every page, the same one `/print` carries in its
 * own header (Amelia, 2026-10-11; every page, 2026-10-16): "Upgrade to Pro"
 * beside the wordmark. The
 * free-import count is a ring on the account avatar (`ImportUsageBadge`).
 *
 * It and the import box open one dialog, held by `FrontDoorUpgradeHost`, which the import box
 * mounts. They reach it through `requestUpgrade` rather than props because
 * they sit in different slots of a server-rendered header.
 */

interface UpgradeRequest {
  trigger: string;
  /** Out of imports: the dialog uses the allowance's own wording. */
  spent: boolean;
}

const hosts = new Set<(request: UpgradeRequest) => void>();

function requestUpgrade(trigger: string) {
  const usage = rememberedImportUsage();
  const spent = trigger !== "topbar_button" && Boolean(usage && usage.used >= usage.limit);
  hosts.forEach((host) => host({ trigger, spent }));
}

// Loaded on the first request, not with the page: it brings the purchase flow
// with it, and most visitors never ask.
const FrontDoorUpgradeDialog = dynamic(
  () => import("@/components/FrontDoorUpgradeDialog").then((mod) => mod.FrontDoorUpgradeDialog),
  { ssr: false },
);

/**
 * Holds the upgrade dialog for a page that hands imports off to `/print`.
 * Besides the header's buttons, an import submitted with none left opens it
 * here instead of navigating (`refuseImportIfSpent`).
 */
export function FrontDoorUpgradeHost() {
  const [request, setRequest] = useState<(UpgradeRequest & { signal: number }) | null>(null);
  useEffect(() => {
    const open = (next: UpgradeRequest) =>
      setRequest((current) => ({ ...next, signal: (current?.signal ?? 0) + 1 }));
    hosts.add(open);
    const stopRefusals = subscribeImportRefusal(() => open({ trigger: "import_banner", spent: true }));
    return () => {
      hosts.delete(open);
      stopRefusals();
    };
  }, []);
  if (!request) return null;
  return <FrontDoorUpgradeDialog openSignal={request.signal} trigger={request.trigger} spent={request.spent} />;
}

/** "Upgrade to Pro", beside the wordmark. Gone for a cook this browser knows
    is Pro; in the page's HTML for everyone else, so it never pops in. */
export function FrontDoorUpgradeButton() {
  const pro = useSyncExternalStore(subscribeImportUsage, importsKnownUnlimited, () => false);
  // Every page's header carries this, but only pages with an import box mount
  // `FrontDoorUpgradeHost`. Elsewhere (the guides, Settings, Projects) the
  // button opens the same dialog itself.
  const [ownSignal, setOwnSignal] = useState(0);
  if (pro) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-premium btn-header"
        onClick={() => {
          if (hosts.size > 0) requestUpgrade("topbar_button");
          else setOwnSignal((signal) => signal + 1);
        }}
      >
        <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
        {/* "Upgrade" alone on a phone, where the bar is tight. */}
        <span>Upgrade<span className="max-sm:hidden"> to Pro</span></span>
      </button>
      {ownSignal > 0 && <FrontDoorUpgradeDialog openSignal={ownSignal} trigger="topbar_button" spent={false} />}
    </>
  );
}
