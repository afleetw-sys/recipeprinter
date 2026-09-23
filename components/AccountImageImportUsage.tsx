"use client";

import { useCallback, useEffect, useState } from "react";
import { formatResetTime, loadImageImportQuota, type ImageImportQuota } from "@/lib/imageImportQuota";

/**
 * This hour's image imports, inset under the "N image imports an hour" line of
 * whichever plan card is yours (see `AccountProStatus`), so the allowance and
 * how much of it is left read as one thing. CookPilot counts them (the number
 * is its, not a guess from this browser).
 *
 * The hour starts at the first image import, not on the clock, so there is no
 * reset time to show until one has been used.
 */
export function AccountImageImportUsage({ uid }: { uid: string }) {
  const [quota, setQuota] = useState<ImageImportQuota | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setQuota(await loadImageImportQuota());
      setFailed(false);
    } catch (err) {
      console.warn("RecipePrinter: could not load image import usage", err);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, uid]);

  // Coming back from an import in another tab should show the new count.
  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const used = quota ? Math.min(quota.used, quota.limit) : 0;
  const fraction = quota && quota.limit > 0 ? used / quota.limit : 0;

  return (
    <div className="mt-cp-1 rounded-lg border border-line bg-page px-cp-3 py-cp-2">
      {quota ? (
        <>
          <p className="text-cp-small font-bold text-ink">
            {used} of {quota.limit} used this hour
          </p>
          <div
            className="mt-cp-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--cp-line)]"
            role="progressbar"
            aria-label="Image imports used this hour"
            aria-valuemin={0}
            aria-valuemax={quota.limit}
            aria-valuenow={used}
          >
            <div className="h-full rounded-full bg-[var(--cp-accent)]" style={{ width: `${fraction * 100}%` }} />
          </div>
          <p className="mt-cp-1 text-cp-small text-ink-soft">
            {quota.resetsAtMs !== null
              ? `Resets at ${formatResetTime(quota.resetsAtMs)}`
              : "Your hour starts with your next image import"}
          </p>
        </>
      ) : failed ? (
        <p className="text-cp-small text-ink-soft">
          Couldn&rsquo;t load this hour&rsquo;s usage.{" "}
          <button type="button" className="font-bold text-ink underline" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      ) : (
        <p className="text-cp-small text-ink-soft">Loading usage…</p>
      )}
    </div>
  );
}
