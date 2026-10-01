/**
 * A recipe's source link, without the marketing tags glued onto it.
 *
 * A link copied from an ad or a newsletter carries a tail of tracking
 * parameters (`utm_*`, Google's `gclid`/`gbraid`/`gad_*`, Facebook's `fbclid`
 * and the rest) that does nothing for the reader and can run to three printed
 * lines. Only parameters on this list go: anything else in the query may be
 * what identifies the page (`?p=123`, `?recipe=…`), so it stays.
 */

const TRACKING_PARAMS = new Set([
  "gclid",
  "gclsrc",
  "gbraid",
  "wbraid",
  "dclid",
  "fbclid",
  "msclkid",
  "yclid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "igshid",
  "igsh",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "epik",
  "s_kwcid",
  "ef_id",
  "mkt_tok",
  "ck_subscriber_id",
  "srsltid",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "_hsenc",
  "_hsmi",
]);

const TRACKING_PREFIXES = ["utm_", "gad_", "hsa_", "vero_", "pk_", "mtm_"];

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** The link with tracking parameters (and the `#` fragment) removed. Anything
    that isn't an http(s) URL comes back unchanged. */
export function cleanSourceUrl(raw: string): string;
export function cleanSourceUrl(raw: string | undefined): string | undefined;
export function cleanSourceUrl(raw: string | undefined): string | undefined {
  if (!raw || !/^https?:\/\//i.test(raw.trim())) return raw;
  try {
    const url = new URL(raw.trim());
    for (const name of Array.from(url.searchParams.keys())) {
      if (isTrackingParam(name)) url.searchParams.delete(name);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * The link as it prints: cleaned, and without `https://`, a leading `www.` or
 * a trailing slash. On paper it only has to be readable and typeable, e.g.
 * `thepioneerwoman.com/food-cooking/recipes/a32450737/slow-cooker-white-chicken-chili-recipe`.
 */
export function printableSourceUrl(raw: string | undefined): string | null {
  if (!raw || !/^https?:\/\//i.test(raw.trim())) return null;
  return cleanSourceUrl(raw)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/(?=$|\?)/, "");
}
