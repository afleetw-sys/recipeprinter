"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { UsageRing } from "@/components/ImportAllowanceLine";
import { CrownIcon, ICON_SIZE } from "@/components/icons";
import { importAllowanceLine } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * The free-import count in the print page's header: the same ring as the
 * import boxes' banner, beside "Upgrade to Pro". Pressing it opens a small
 * menu with the same facts (how many are used, when they reset) and Upgrade.
 *
 * Renders nothing where the allowance doesn't apply (`enabled` false: a
 * cookbook, a Pro member) or isn't live.
 */
export function ImportUsageMenu({ enabled = true, onUpgrade }: { enabled?: boolean; onUpgrade: () => void }) {
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
        className="btn btn-neutral btn-compact"
        aria-haspopup="menu"
        aria-expanded={open}
        // The ring is a picture of the count; the name says it in words.
        aria-label={`Free imports: ${line.lead}`}
        onClick={() => setOpen((value) => !value)}
      >
        <UsageRing fraction={fraction} size={18} />
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="Free imports" align="end">
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
