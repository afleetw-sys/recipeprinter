/**
 * The free import allowance, in one place (docs/import-meter-plan.md, 8.1):
 * the numbers, the switch, and the line the free-import ring's menu shows.
 */

/** Card imports a free visitor gets per window. The window is fixed: it
    starts with the first import and everything resets together when it ends.
    Keep in sync with CookPilot's `recipePrinterConfig/importMeter`. */
export const FREE_IMPORTS_PER_WINDOW = 10;
export const FREE_IMPORT_WINDOW_DAYS = 30;
/** An unbought cookbook's free preview size (decision D8). */
export const FREE_COOKBOOK_RECIPES = 10;
/**
 * Gates BOTH limits, the card allowance and the cookbook free size, and every
 * line of UI that mentions them. The client only refuses an import when this
 * is true AND the meter answers in `enforce` mode, so the copy can be live
 * before the server is switched on, and setting this to false is a complete
 * client-side rollback. Turned on 2026-10-10 with the go-live build.
 */
export const IMPORT_ALLOWANCE_LIVE = true;
// No "no account required" here: beside a link to Pro it reads as if Pro
// needs no account either (Amelia, 2026-10-10).
export const FREE_IMPORTS_LINE = `${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days.`;

/** "Oct 21": the day the free imports reset, in the cook's own locale. */
export function formatImportReturnDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface ImportAllowanceLine {
  /** The count, or the allowance when nothing has been used. */
  lead: string;
  /** When it resets, once anything has been used. */
  detail?: string;
}

/**
 * What the free-import ring's menu tells a free cook: how many imports they've
 * used toward the limit, from the first one on, and when it resets. `usage`
 * is the server's count; without one the line states the allowance.
 */
export function importAllowanceLine(
  usage: { used: number; limit: number; nextFreeAt: number | null } | null,
): ImportAllowanceLine {
  if (!usage || usage.used <= 0) return { lead: FREE_IMPORTS_LINE };
  const used = Math.min(usage.used, usage.limit);
  return {
    lead: `${used} of ${usage.limit} free imports used.`,
    ...(usage.nextFreeAt !== null ? { detail: `Resets ${formatImportReturnDate(usage.nextFreeAt)}.` } : {}),
  };
}
