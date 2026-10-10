/**
 * The free import allowance, in one place (docs/import-meter-plan.md, 8.1).
 *
 * Nothing renders from this yet. During measurement the site says nothing
 * about an allowance; the copy and the limits ship together in the go-live
 * PR, which is the only change that sets `IMPORT_ALLOWANCE_LIVE`.
 */

/** Card imports a free visitor gets per rolling window. Keep in sync with
    CookPilot's `recipePrinterConfig/importMeter`. */
export const FREE_IMPORTS_PER_WINDOW = 10;
export const FREE_IMPORT_WINDOW_DAYS = 30;
/** An unbought cookbook's free preview size (decision D8). */
export const FREE_COOKBOOK_RECIPES = 10;
/**
 * Gates BOTH limits, the card allowance and the cookbook free size. The client
 * only ever restricts anyone when this is true AND the meter answers in
 * `enforce` mode, so a build from the measurement era can't restrict anyone
 * even if the server config is flipped early.
 */
export const IMPORT_ALLOWANCE_LIVE = false;
export const FREE_IMPORTS_LINE = `${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days. No account required.`;

/** "Oct 21": the day an import comes back, in the cook's own locale. */
export function formatImportReturnDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface ImportAllowanceLine {
  text: string;
  /** None left: the line offers Pro. */
  spent: boolean;
}

/**
 * The one line every import box shows a free cook: how many imports they've
 * used toward the limit, from the first one on, and from two left, when the
 * next one comes back. `usage` is the server's count; without one the line
 * states the allowance.
 */
export function importAllowanceLine(
  usage: { used: number; limit: number; nextFreeAt: number | null } | null,
): ImportAllowanceLine {
  if (!usage || usage.used <= 0) return { text: FREE_IMPORTS_LINE, spent: false };
  const used = Math.min(usage.used, usage.limit);
  const left = usage.limit - used;
  const count = `${used} of ${usage.limit} free imports used.`;
  if (left >= 3 || usage.nextFreeAt === null) return { text: `${count} No account required.`, spent: left <= 0 };
  return {
    text: `${count} Your next one's back on ${formatImportReturnDate(usage.nextFreeAt)}.`,
    spent: left <= 0,
  };
}

/** What the "about free imports" note says, in order. */
export const IMPORT_ALLOWANCE_NOTES = [
  `Each import comes back ${FREE_IMPORT_WINDOW_DAYS} days after you used it.`,
  "Editing, customizing and reprinting recipes you've already imported never uses an import.",
  "RecipePrinter Pro includes unlimited imports.",
  `Making a cookbook instead? You can preview one free with up to ${FREE_COOKBOOK_RECIPES} recipes, and it doesn't use these.`,
];
