"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatResetTime,
  loadImageImportQuota,
  type ImageImportQuota,
} from "@/lib/imageImportQuota";

/**
 * This hour's photo imports, for every plan. CookPilot counts them (the
 * number is its, not a guess from this browser), so a Pro account sees its
 * larger allowance and a free one sees what Pro would give it.
 *
 * The hour starts at the first photo import, not on the clock, so there is no
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
      console.warn("RecipePrinter: could not load photo import usage", err);
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
    <section className="mb-cp-7 rounded-xl border border-line bg-card p-cp-5">
      <h2 className="text-cp-h2 font-extrabold text-ink">Photo imports</h2>
      {quota ? (
        <>
          <p className="mt-cp-2 text-cp-body font-bold text-ink">
            {used} of {quota.limit} used this hour
          </p>
          <div
            className="mt-cp-2 h-2 w-full overflow-hidden rounded-full bg-[var(--cp-line)]"
            role="progressbar"
            aria-label="Photo imports used this hour"
            aria-valuemin={0}
            aria-valuemax={quota.limit}
            aria-valuenow={used}
          >
            <div
              className="h-full rounded-full bg-[var(--cp-accent)]"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
          <p className="mt-cp-2 text-cp-small text-ink-soft">
            {quota.resetsAtMs !== null
              ? `Resets at ${formatResetTime(quota.resetsAtMs)}.`
              : `Your hour starts with your next photo import.`}
            {!quota.pro && ` Pro includes ${quota.proLimit} an hour.`}
          </p>
        </>
      ) : failed ? (
        <>
          <p className="mt-1 text-cp-small text-ink-soft">Couldn&rsquo;t load your photo imports.</p>
          <button
            type="button"
            className="btn btn-secondary btn-compact mt-cp-2 w-full sm:w-auto"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </>
      ) : (
        <p className="mt-1 text-cp-small text-ink-soft">Loading…</p>
      )}
    </section>
  );
}
