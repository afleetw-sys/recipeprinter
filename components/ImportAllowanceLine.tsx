"use client";

import Link from "next/link";
import { importAllowanceLine } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * How many free imports a cook has used toward the limit, under every import
 * box (docs/import-meter-plan.md, 8.3). Always the server's count, signed in or
 * out. Renders nothing for Pro, for cookbooks (`enabled` false) and while the
 * allowance isn't live.
 *
 * Quiet on purpose: one caption-size line, and at none left a text link to
 * Pro. It never disables the import box: the server is always asked first, so
 * a stale count can't lock anyone out.
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

  return (
    <p className={`text-cp-caption text-ink-soft ${className}`} data-import-allowance>
      {line.text}
      {line.spent && " "}
      {line.spent &&
        (onGetUnlimited ? (
          <button type="button" className="font-bold text-ink underline" onClick={onGetUnlimited}>
            Get unlimited imports
          </button>
        ) : (
          <Link href="/pricing" className="font-bold text-ink underline">
            Get unlimited imports
          </Link>
        ))}
    </p>
  );
}
