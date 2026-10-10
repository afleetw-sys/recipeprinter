"use client";

import Link from "next/link";
import { importAllowanceLine } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * How many free imports a cook has used toward the limit, as a small banner
 * with every import box (docs/import-meter-plan.md, 8.3). Always the server's
 * count, signed in or out. Renders nothing for Pro, for cookbooks (`enabled`
 * false) and while the allowance isn't live.
 *
 * A banner, not a caption (Amelia, 2026-10-10): neutral gray with a hairline
 * border and the controls' corner radius, a ring showing how much is used,
 * and at none left a link to Pro. It never disables the import box: the server is always
 * asked first, so a stale count can't lock anyone out.
 */
export function ImportAllowanceLine({
  enabled = true,
  onGetUnlimited,
  className = "",
}: {
  /** False where the allowance doesn't apply: a cookbook, a known Pro member. */
  enabled?: boolean;
  /** Opens the Pro dialog. Without one, the offer links to the pricing page. */
  onGetUnlimited?: () => void;
  className?: string;
}) {
  const { hidden, usage } = useImportUsage(enabled);
  if (hidden) return null;
  const line = importAllowanceLine(usage);
  const fraction = usage && usage.limit > 0 ? Math.min(usage.used, usage.limit) / usage.limit : 0;
  const offerClass = "shrink-0 font-bold text-ink underline";

  return (
    <div
      // `rounded` is the control radius, the same corners as the field and
      // the buttons this sits beside. Neutral gray in every state: it is
      // information, not a selected control (blue) or a Pro surface (gold).
      className={`flex flex-wrap items-center justify-between gap-x-cp-3 gap-y-1 rounded border border-line bg-[var(--cp-surface-muted)] px-cp-3 py-cp-2 text-cp-small ${className}`}
      data-import-allowance
    >
      <div className="flex min-w-0 items-center gap-cp-2">
        <UsageRing fraction={fraction} />
        <p className="text-ink">
          <span className="font-bold">{line.lead}</span>
          {line.detail && <span className="text-ink-soft"> {line.detail}</span>}
        </p>
      </div>
      {line.spent &&
        (onGetUnlimited ? (
          <button type="button" className={offerClass} onClick={onGetUnlimited}>
            Get unlimited imports
          </button>
        ) : (
          <Link href="/pricing" className={offerClass}>
            Get unlimited imports
          </Link>
        ))}
    </div>
  );
}

const RING_SIZE = 18;
const RING_STROKE = 3;
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
