"use client";

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
  if (hidden || !usage || usage.limit <= 0 || usage.used <= 0) return null;
  return (
    <span
      className="pointer-events-none absolute -right-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full"
      aria-hidden
    >
      <UsageRing used={usage.used} limit={usage.limit} />
    </span>
  );
}

/**
 * The count as a ring that fills clockwise from the top: empty before the
 * first import, full at none left. It turns red once more than 8 of 10 are
 * used, like Claude's own usage ring. Decorative: the account menu says the
 * same thing in words, so it is hidden from screen readers.
 */
export function UsageRing({ used, limit, size = 14 }: { used: number; limit: number; size?: number }) {
  const fraction = limit > 0 ? Math.min(used, limit) / limit : 0;
  const nearlyOut = fraction > 0.8;
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
