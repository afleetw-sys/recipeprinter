"use client";

import { formatImportReturnDate, importsNearlyOut } from "@/lib/freeImports";
import { useImportUsage } from "@/lib/useImportUsage";

/**
 * This 30 days' free imports, inset under the allowance line on the Free plan
 * card (see `AccountProStatus`). The count is CookPilot's, not this browser's.
 * Renders nothing while the allowance isn't live.
 */
export function AccountImportAllowanceUsage() {
  const { hidden, usage } = useImportUsage();
  if (hidden) return null;
  const limit = usage?.limit ?? 0;
  const used = usage ? Math.min(usage.used, usage.limit) : 0;

  return (
    <div className="mt-cp-1 rounded-lg border border-line bg-page px-cp-3 py-cp-2">
      {usage ? (
        <>
          <p className="text-cp-small font-bold text-ink">
            {used} of {limit} used
          </p>
          <div
            className="mt-cp-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--cp-line)]"
            role="progressbar"
            aria-label="Free recipe imports used"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={used}
          >
            <div
              className={`h-full rounded-full ${importsNearlyOut(used, limit) ? "bg-[var(--cp-error)]" : "bg-[var(--cp-accent)]"}`}
              style={{ width: `${(used / limit) * 100}%` }} />
          </div>
          <p className="mt-cp-1 text-cp-small text-ink-soft">
            {usage.nextFreeAt !== null
              ? `Resets ${formatImportReturnDate(usage.nextFreeAt)}`
              : "Your 30 days start with your next import"}
          </p>
        </>
      ) : (
        <p className="text-cp-small text-ink-soft">None used yet</p>
      )}
    </div>
  );
}
