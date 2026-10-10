"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CrownIcon, ICON_SIZE } from "@/components/icons";
import { importAllowanceLine } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

// Loaded on the first press of Upgrade, not with the banner: it brings the
// purchase flow with it, and most visitors never press it.
const ImportBannerUpgrade = dynamic(
  () => import("@/components/ImportBannerUpgrade").then((mod) => mod.ImportBannerUpgrade),
  { ssr: false },
);

/**
 * How many free imports a cook has used toward the limit, as a small banner
 * with every import box (docs/import-meter-plan.md, 8.3). Always the server's
 * count, signed in or out. Renders nothing for Pro, for cookbooks (`enabled`
 * false) and while the allowance isn't live.
 *
 * A quiet banner (Amelia, 2026-10-10): a hairline outline, a small ring that
 * fills as imports are used, the count, and an Upgrade button at the far
 * right in every state. It never disables the import box: the server is
 * always asked first, so a stale count can't lock anyone out.
 */
export function ImportAllowanceLine({
  enabled = true,
  onGetUnlimited,
  className = "",
}: {
  /** False where the allowance doesn't apply: a cookbook, a known Pro member. */
  enabled?: boolean;
  /** Opens the page's own Pro dialog (`/print`). Without one, the banner
      opens the same dialog itself, so Upgrade works the same everywhere. */
  onGetUnlimited?: () => void;
  className?: string;
}) {
  const { hidden, usage } = useImportUsage(enabled);
  // How many times Upgrade has been pressed here; 0 until the first.
  const [upgradePresses, setUpgradePresses] = useState(0);
  if (hidden) return null;
  const line = importAllowanceLine(usage);
  const fraction = usage && usage.limit > 0 ? Math.min(usage.used, usage.limit) / usage.limit : 0;
  // As quiet as the rest of the banner: text, not a boxed button. The small
  // crown is what marks it as Pro, and it only darkens on hover.
  const upgrade = (
    <>
      <CrownIcon size={ICON_SIZE.xs} className="text-[var(--cp-premium-bright)]" />
      Upgrade
    </>
  );
  const upgradeClass =
    "inline-flex shrink-0 items-center gap-1 rounded px-cp-2 py-1 font-semibold text-ink-soft hover:text-ink";

  return (
    <div
      // Quiet on purpose: no fill, a hairline outline at the control radius
      // (the field's and the buttons' corners), caption-size soft text. The
      // count is the only thing in ink.
      className={`flex items-center justify-between gap-cp-3 rounded border border-line py-1 pl-cp-3 pr-1 text-cp-caption text-ink-soft ${className}`}
      data-import-allowance
    >
      <div className="flex min-w-0 items-center gap-cp-2">
        <UsageRing fraction={fraction} />
        <p>
          <span className="font-semibold text-ink">{line.lead}</span>
          {line.detail && <> {line.detail}</>}
        </p>
      </div>
      <button
        type="button"
        className={upgradeClass}
        onClick={() => (onGetUnlimited ? onGetUnlimited() : setUpgradePresses((count) => count + 1))}
      >
        {upgrade}
      </button>
      {upgradePresses > 0 && <ImportBannerUpgrade openSignal={upgradePresses} />}
    </div>
  );
}

const RING_SIZE = 14;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The count as a ring that fills clockwise from the top: empty before the
 * first import, full at none left. Decorative: the sentence beside it says the
 * same thing in words, so it is hidden from screen readers.
 */
function UsageRing({ fraction }: { fraction: number }) {
  const center = RING_SIZE / 2;
  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="shrink-0"
      aria-hidden
    >
      <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke="var(--cp-line)" strokeWidth={RING_STROKE} />
      {/* Nothing drawn at zero: a round cap would leave a dot. */}
      {fraction > 0 && (
        <circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--cp-ink-soft)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - fraction)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
    </svg>
  );
}
