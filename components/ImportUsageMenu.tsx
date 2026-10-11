"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { CrownIcon, ICON_SIZE } from "@/components/icons";
import { importAllowanceLine } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * The free-import count as a button: a ring that fills as imports are used,
 * in the header to the left of the account (the homepage and the print page
 * alike) and by the Add recipes dialog's title. Pressing it opens a small menu
 * with the facts (how many are used, when they reset) and Upgrade. It is the
 * only place the count shows: the banner under the import boxes is gone
 * (Amelia, 2026-10-11).
 *
 * Renders nothing where the allowance doesn't apply (`enabled` false: a
 * cookbook, a Pro member) or isn't live.
 */
export function ImportUsageMenu({
  enabled = true,
  onUpgrade,
  align = "end",
  header = false,
}: {
  enabled?: boolean;
  onUpgrade: () => void;
  /** Which edge of the ring the menu lines up with. */
  align?: "start" | "end";
  /** `SiteHeader`'s own control size, for a bar whose other buttons use it. */
  header?: boolean;
}) {
  const { hidden, usage } = useImportUsage(enabled);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  if (hidden) return null;
  const line = importAllowanceLine(usage);
  const fraction = usage && usage.limit > 0 ? Math.min(usage.used, usage.limit) / usage.limit : 0;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        // An icon button with no fill of its own (Amelia, 2026-10-10): the
        // ring is the control, and only a hover shows it can be pressed.
        className={`btn-ghost ${header ? "btn-header" : "btn-compact"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The ring is a picture of the count; the name says it in words.
        aria-label={`Free imports: ${line.lead}`}
        onClick={() => setOpen((value) => !value)}
      >
        <UsageRing fraction={fraction} size={18} />
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="Free imports" align={align}>
          <div className="px-[9px] pb-cp-2 pt-[6px]">
            <p className="text-cp-small font-bold text-ink">{line.lead}</p>
            {line.detail && <p className="text-cp-small text-ink-soft">{line.detail}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            className="btn btn-premium btn-compact w-full"
            onClick={() => {
              setOpen(false);
              onUpgrade();
            }}
          >
            <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
            Upgrade to Pro
          </button>
        </AnchoredMenu>
      )}
    </>
  );
}

/**
 * The count as a ring that fills clockwise from the top: empty before the
 * first import, full at none left. Decorative: the button's name says the
 * same thing in words, so it is hidden from screen readers.
 */
function UsageRing({ fraction, size = 14 }: { fraction: number; size?: number }) {
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
