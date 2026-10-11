"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CrownIcon, ICON_SIZE } from "@/components/icons";
import { importAllowanceLine } from "@/lib/freeImports";
import { subscribeImportRefusal } from "@/lib/importMeter";
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
 * A quiet banner (Amelia, 2026-10-10): a hairline outline, a small ring in
 * the accent colour that fills as imports are used (the one thing in it meant
 * to catch the eye), the count, and Upgrade at the far right in every state. It never disables the import box: the server is
 * always asked first, so a stale count can't lock anyone out.
 */
export function ImportAllowanceLine({
  enabled = true,
  untilUsed = false,
  onGetUnlimited,
  className = "",
}: {
  /** Stay out of sight until the cook has used an import. For the front door
      (the homepage, the SEO pages): a first-time visitor is there to try the
      thing, and a line about an allowance they haven't touched is one more
      thing to read first (Amelia, 2026-10-10). From the first import on, the
      count shows as everywhere else. */
  untilUsed?: boolean;
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
  // On a page that hands imports off to /print, an import submitted with none
  // left opens the dialog here instead of navigating (`refuseImportIfSpent`).
  // Only where this banner owns the dialog; /print passes its own.
  useEffect(() => {
    if (hidden || onGetUnlimited) return;
    return subscribeImportRefusal(() => setUpgradePresses((count) => count + 1));
  }, [hidden, onGetUnlimited]);
  if (hidden) return null;
  if (untilUsed && (!usage || usage.used <= 0)) return null;
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
      {upgradePresses > 0 && (
        <ImportBannerUpgrade openSignal={upgradePresses} spent={Boolean(usage && usage.used >= usage.limit)} />
      )}
    </div>
  );
}


/**
 * The count as a ring that fills clockwise from the top: empty before the
 * first import, full at none left. Decorative: the sentence beside it says the
 * same thing in words, so it is hidden from screen readers.
 */
export function UsageRing({ fraction, size = 14 }: { fraction: number; size?: number }) {
  const stroke = size >= 18 ? 3 : 2.5;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--cp-line)" strokeWidth={stroke} />
      {/* Nothing drawn at zero: a round cap would leave a dot. */}
      {fraction > 0 && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--cp-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
    </svg>
  );
}
