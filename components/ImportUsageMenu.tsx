"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { CrownIcon, GaugeIcon, ICON_SIZE } from "@/components/icons";
import { importAllowanceLine, importsNearlyOut } from "@/lib/freeImports";
import { rememberedImportUsage, usageNow } from "@/lib/importMeter";
import { useImportUsage } from "@/lib/useImportUsage";

// Beside the avatar the ring takes the avatar's own box (`.icon-button` at the
// `data-rp-avatar` size: the same square, corner and hairline outline, with no fill), so the
// two read as a pair of controls.
const BUTTON_CLASS = {
  header: "icon-button bg-transparent text-ink mx-px sm:-mx-0.5",
  topbar: "icon-button bg-transparent text-ink",
} as const;
const AVATAR_SIZE = { header: "header", topbar: "compact" } as const;

/**
 * The free-import count as a button: a ring that fills as imports are used,
 * in the header to the left of the account, on the homepage and the print page
 * alike, and nowhere else (Amelia, 2026-10-11). Pressing it opens a small menu
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
  placement,
}: {
  enabled?: boolean;
  onUpgrade: () => void;
  /** Which edge of the ring the menu lines up with. */
  align?: "start" | "end";
  /**
   * Where it sits. Beside the account button the ring sits in an outlined box
   * exactly the avatar's size, so the two read as a pair (Amelia, 2026-10-11):
   * - `header`: `SiteHeader`, 32px, and 10px clear of its neighbours on each
   *   side (the bar's own gap plus this margin).
   * - `topbar`: the print page's phone bar, 30px, at that bar's own gap.
   */
  placement: "header" | "topbar";
}) {
  const { hidden, usage } = useImportUsage(enabled);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const fill = useNewImportFill(usage?.used ?? null);
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
        className={BUTTON_CLASS[placement]}
        data-rp-avatar={AVATAR_SIZE[placement]}
        aria-haspopup="menu"
        aria-expanded={open}
        // The ring is a picture of the count; the name says it in words.
        aria-label={`Free imports: ${line.lead}`}
        onClick={() => setOpen((value) => !value)}
      >
        {/* Nothing used yet: an empty ring reads as a blank circle, so a gauge
            says "usage" until there is some to draw (Amelia, 2026-10-11). */}
        {fraction > 0 ? <UsageRing
            fraction={fraction}
            nearlyOut={importsNearlyOut(usage?.used ?? 0, usage?.limit ?? 0)}
            size={18}
            fill={fill && usage ? { key: fill.key, from: Math.min(fill.fromUsed, usage.limit) / usage.limit } : null}
          /> : <GaugeIcon size={ICON_SIZE.md} />}
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="Free imports" align={align}>
          {/* The count goes to the Plan section of Settings, where the free and
              Pro plans sit side by side (Amelia, 2026-10-16). */}
          <Link
            href="/account#plan"
            role="menuitem"
            className="mb-cp-1 block rounded-lg px-[9px] pb-cp-2 pt-[6px] hover:bg-page"
            onClick={() => setOpen(false)}
          >
            <p className="text-cp-small font-bold text-ink">{line.lead}</p>
            {line.detail && <p className="text-cp-small text-ink-soft">{line.detail}</p>}
          </Link>
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

/**
 * The count as a ring that fills clockwise from the top: empty before the
 * first import, full at none left, red when nearly out. Decorative: the button's name says the
 * same thing in words, so it is hidden from screen readers.
 */
function UsageRing({
  fraction,
  nearlyOut = false,
  size = 14,
  fill = null,
}: {
  fraction: number;
  /** Red past 8 of 10 (`importsNearlyOut`). */
  nearlyOut?: boolean;
  size?: number;
  /** An import was just counted: fill from `from` to `fraction`. */
  fill?: { key: number; from: number } | null;
}) {
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
