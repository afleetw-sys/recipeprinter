// ─────────────────────────────────────────────────────────────────────────────
// Reading untrusted JSON-ish data.
//
// Every import adapter faces the same problem: a value arrived from somewhere
// we do not control — a CookPilot callable, a Firestore document, a Paprika
// archive, a page's JSON-LD — and the field we want may be a string, a number,
// missing, or something else entirely.
//
// These lived as private copies inside each adapter, one set per source, and
// they had drifted: `asString` rejected a NaN in one file and turned it into
// the literal text "NaN" in three others, and there were two `asNumber`s with
// genuinely different rules. Which meant the answer to "what does a number in
// a string field mean?" depended on which library the recipe came from, for no
// reason anyone had chosen.
//
// The rules here are the strict ones. Where an adapter genuinely needs looser
// behaviour it defines that itself, under a name that says what it does —
// see `dimensionPx` in lib/recipeImages.ts, which parses "1200px" because the
// HTML attributes and URL parameters it reads really do carry sizes that way.
// A local helper named for its job is fine; a fifth private `asString` is not.
//
// Deliberately NOT a validation library. Every function here answers one
// question and returns `undefined` rather than throwing, because an import
// that drops one unreadable field is worth far more to a cook than an import
// that fails whole.
//
// (`asStringArray` stays in lib/cookpilotRecipes.ts: it has one caller and its
// "drop empty strings" rule is that decoder's, not a general one. It belongs
// here the moment a second adapter wants it.)
// ─────────────────────────────────────────────────────────────────────────────

export type AnyRecord = Record<string, unknown>;

/** The value as an object to read keys off, or null when it isn't one.
    Arrays pass — an adapter that cares checks `Array.isArray` itself. */
export function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

/**
 * The value as a non-empty trimmed string, or undefined.
 *
 * A number is rendered, because these sources routinely type a servings count
 * or a yield as a number where the shape says string. `Number.isFinite` guards
 * that branch: without it `String(NaN)` puts the seven characters "NaN" into a
 * printed recipe, which is worse than the field simply being absent. Firestore
 * can genuinely store NaN, so this is reachable, not theoretical.
 *
 * Empty and whitespace-only strings are undefined rather than "": a blank
 * field and a missing one mean the same thing to every caller here, and
 * collapsing them once is better than each one testing `.trim()` again.
 */
export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * The value as a finite number, or undefined.
 *
 * Strict: a numeric STRING is not a number here. Adapters that need to read
 * "600" or "600px" are doing something more specific than this and should say
 * so at their own call site — a shared coercion that quietly accepted both
 * would make every consumer's type wider than its source really is.
 */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
