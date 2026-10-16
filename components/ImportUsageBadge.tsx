"use client";

import { useState, type CSSProperties } from "react";
import { importsNearlyOut } from "@/lib/freeImports";
import { rememberedImportUsage, usageNow } from "@/lib/importMeter";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * The free-import count as a badge on the account avatar: a ring that fills as
 * imports are used (Amelia, 2026-10-13). It took the place of the ring that
 * had its own button beside the avatar; the facts it opened to (how many are
 * used, when they reset) are the first thing in the account menu now.
 *
 * Nothing before the first import, since an empty ring reads as a blank
 * circle, and nothing for a Pro member, who has no count.
 */
export function ImportUsageBadge() {
  const { hidden, usage } = useImportUsage();
  const fill = useNewImportFill(usage?.used ?? null);
  if (hidden || !usage || usage.limit <= 0 || usage.used <= 0) return null;
  return (
    <span
      className="pointer-events-none absolute -right-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--rp-header-surface,var(--cp-page))]"
      aria-hidden
    >
      <UsageRing
        used={usage.used}
        limit={usage.limit}
        fill={fill ? { key: fill.key, from: Math.min(fill.fromUsed, usage.limit) / usage.limit } : null}
      />
    </span>
  );
}

/**
 * The count as a ring that fills clockwise from the top: empty before the
 * first import, full at none left. Red when nearly out (`importsNearlyOut`).
 * Decorative: the account menu says the same thing in words, so it is hidden
 * from screen readers.
 */
export function UsageRing({
  used,
  limit,
  size = 14,
  fill = null,
}: {
  used: number;
  limit: number;
  size?: number;
  /** An import was just counted: fill from `from` to the new count. */
  fill?: { key: number; from: number } | null;
}) {
  const fraction = limit > 0 ? Math.min(used, limit) / limit : 0;
  const nearlyOut = importsNearlyOut(used, limit);
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
          // A new key per counted import restarts the fill animation.
          key={fill?.key ?? 0}
          className={fill ? "rp-usage-ring-fill" : undefined}
          style={fill ? ({ "--rp-ring-from": `${length * (1 - fill.from)}px` } as CSSProperties) : undefined}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={nearlyOut ? "var(--cp-error)" : "var(--cp-accent)"}
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

/**
 * Set when an import has just been counted, so the ring can fill from where it
 * was to the new count. Only an import made while the ring is on screen counts:
 * the count this browser already remembered when the page loaded is the
 * baseline, so a page load or the hydration swap from "no count" never animates.
 */
function useNewImportFill(used: number | null): { key: number; fromUsed: number } | null {
  // Read on the client only, and never rendered, so the server's 0 can't mismatch.
  const [baseline] = useState(() => {
    if (typeof window === "undefined") return 0;
    const remembered = rememberedImportUsage();
    return remembered ? usageNow(remembered, Date.now()).used : 0;
  });
  const [shown, setShown] = useState(baseline);
  const [fill, setFill] = useState<{ key: number; fromUsed: number } | null>(null);
  // No count yet (the first render, or a visitor who hasn't imported): nothing to compare.
  if (used !== null && used !== shown) {
    setShown(used);
    // Only an increase animates. A reset to 0 just redraws.
    setFill(used > shown ? { key: (fill?.key ?? 0) + 1, fromUsed: shown } : null);
  }
  return fill;
}
