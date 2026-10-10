"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FREE_IMPORTS_LINE, IMPORT_ALLOWANCE_NOTES, importAllowanceLine } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * How many free imports a cook has used toward the limit, under every import
 * box (docs/import-meter-plan.md, 8.3). Always the server's count, signed in or
 * out. Renders nothing for Pro, for cookbooks (`enabled` false) and while the
 * allowance isn't live.
 *
 * Quiet on purpose: one caption-size line, a note behind a small button, and at
 * none left a text link to Pro. It never disables the import box: the server
 * is always asked first, so a stale count can't lock anyone out.
 */
export function ImportAllowanceLine({
  enabled = true,
  alwaysShow = true,
  onGetUnlimited,
  className = "",
}: {
  /** False where the allowance doesn't apply: a cookbook, a known Pro member. */
  enabled?: boolean;
  /** False to stay silent until an import has been used (the print page's rail). */
  alwaysShow?: boolean;
  /** Opens the Pro dialog. Without one, the offer links to the pricing page. */
  onGetUnlimited?: () => void;
  className?: string;
}) {
  const { hidden, usage } = useImportUsage(enabled);
  const [open, setOpen] = useState(false);
  const noteId = useId();
  if (hidden) return null;
  if (!alwaysShow && (!usage || usage.used <= 0)) return null;
  const line = importAllowanceLine(usage);

  return (
    <div className={`text-cp-caption text-ink-soft ${className}`} data-import-allowance>
      <p>
        {line.text}{" "}
        {line.spent &&
          (onGetUnlimited ? (
            <button type="button" className="font-bold text-ink underline" onClick={onGetUnlimited}>
              Get unlimited imports
            </button>
          ) : (
            <Link href="/pricing" className="font-bold text-ink underline">
              Get unlimited imports
            </Link>
          ))}{" "}
        <button
          type="button"
          className="underline"
          aria-expanded={open}
          aria-controls={noteId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide details" : "How it works"}
        </button>
      </p>
      {open && (
        <ul id={noteId} className="mt-cp-1 list-disc space-y-0.5 pl-4">
          {/* The rule itself leads when the line above is showing a count. */}
          {line.text !== FREE_IMPORTS_LINE && <li>{FREE_IMPORTS_LINE}</li>}
          {IMPORT_ALLOWANCE_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
