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
