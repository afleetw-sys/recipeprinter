/**
 * Image imports per hour, by plan.
 *
 * CookPilot enforces these (functions/src/imageImportLimits.ts, separate repo,
 * keep in sync by hand). They live here too because they are part of what Pro
 * sells: both plan cards name them, and the limit-reached message offers the
 * Pro number to a free account. Settings reads the live numbers back from
 * CookPilot (`loadImageImportQuota`), so a drift shows up there first.
 */
export const IMAGE_IMPORTS_PER_HOUR_FREE = 5;
export const IMAGE_IMPORTS_PER_HOUR_PRO = 30;

export const FREE_IMAGE_IMPORT_BENEFIT = `${IMAGE_IMPORTS_PER_HOUR_FREE} image imports an hour`;
export const PRO_IMAGE_IMPORT_BENEFIT = `${IMAGE_IMPORTS_PER_HOUR_PRO} image imports an hour`;

export interface ImageImportQuota {
  used: number;
  limit: number;
  /** When the current hour's window closes. Null when no window is open,
      which means nothing has been used and the next import starts a fresh hour. */
  resetsAtMs: number | null;
  pro: boolean;
  proLimit: number;
}

/** The `details` CookPilot attaches to its limit-reached error. */
export interface ImageLimitDetails {
  limit: number;
  resetsAtMs: number | null;
  pro: boolean;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads the limit, reset time and plan off a thrown callable error, when it is
 * CookPilot's photo-import limit. Falls back to the number in the message for
 * a backend that predates the structured details, so an older deploy still
 * gets the specific sentence rather than the generic one.
 */
export function imageLimitDetails(err: unknown): ImageLimitDetails | null {
  const details = (err as { details?: unknown } | null)?.details as Record<string, unknown> | undefined;
  if (details && details.reason === "image_hourly_limit") {
    const limit = finiteOrNull(details.limit);
    if (limit !== null) {
      return { limit, resetsAtMs: finiteOrNull(details.resetsAtMs), pro: details.pro === true };
    }
  }
  const message = err instanceof Error ? err.message : "";
  const match = /image parsing limit of (\d+) per hour/i.exec(message);
  if (!match) return null;
  const limit = Number(match[1]);
  return { limit, resetsAtMs: null, pro: limit >= IMAGE_IMPORTS_PER_HOUR_PRO };
}

export function formatResetTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * What a cook who ran out of photo imports reads. It says why (the hour's
 * allowance is used up), when it comes back, and, on the free plan, what Pro
 * would give them instead.
 */
export function imageLimitMessage({ limit, resetsAtMs, pro }: ImageLimitDetails): string {
  const used = `You've already done ${limit} image imports this hour.`;
  const when = resetsAtMs !== null ? `at ${formatResetTime(resetsAtMs)}` : "within the hour";
  if (pro) return `${used} You can import more images ${when}.`;
  return `${used} You can import more ${when}, or upgrade to Pro for ${IMAGE_IMPORTS_PER_HOUR_PRO} image imports an hour.`;
}

function parseQuota(data: unknown): ImageImportQuota | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const used = finiteOrNull(record.used);
  const limit = finiteOrNull(record.limit);
  if (used === null || limit === null) return null;
  return {
    used,
    limit,
    resetsAtMs: finiteOrNull(record.resetsAtMs),
    pro: record.pro === true,
    proLimit: finiteOrNull(record.proLimit) ?? IMAGE_IMPORTS_PER_HOUR_PRO,
  };
}

/** This hour's photo imports, from CookPilot. Read-only; it never spends one. */
export async function loadImageImportQuota(): Promise<ImageImportQuota> {
  const { callCookPilotParser } = await import("@/lib/parser");
  const quota = parseQuota(await callCookPilotParser("getImageImportQuota", {}));
  if (!quota) throw new Error("getImageImportQuota returned an unexpected shape");
  return quota;
}
