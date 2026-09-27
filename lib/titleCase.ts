/**
 * All caps ↔ Title Case for a recipe title.
 *
 * A lot of titles arrive shouting ("CHICKEN TIKKA MASALA"): the site set them
 * in capitals and the import kept the letters as typed. The title field's
 * toolbar offers the two cases; these rewrite the text itself, because Title
 * Case cannot be drawn from capitals with CSS alone (`capitalize` would also
 * raise "and" and "of").
 *
 * Built with `RegExp` rather than as literals: the `u` flag these need for
 * letters outside ASCII (crème, jalapeño) is one the compiler's target
 * refuses in a literal, though every browser we run in has it.
 */
const HAS_LETTER = new RegExp("\\p{L}", "u");
const FIRST_LETTER = new RegExp("\\p{L}", "u");

/** Short words a title keeps lowercase, unless one starts or ends it or
    follows a colon. Articles, conjunctions and short prepositions, plus the
    joins that turn up in dish names ("cacio e pepe", "pain de mie"). */
const MINOR_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "with", "from", "into", "over",
  "e", "de", "del", "di", "da", "la", "le", "au", "aux", "en", "y",
]);

/** Whether the title has letters and every one of them is a capital. */
export function isAllCaps(title: string): boolean {
  return HAS_LETTER.test(title) && title === title.toLocaleUpperCase();
}

export function toAllCaps(title: string): string {
  return title.toLocaleUpperCase();
}

function capitalize(part: string): string {
  const match = FIRST_LETTER.exec(part);
  if (!match) return part;
  const at = match.index;
  return part.slice(0, at) + part.charAt(at).toLocaleUpperCase() + part.slice(at + 1);
}

/**
 * Each word capitalized, the small ones left small.
 *
 * From capitals there is no telling which letters were meant to stay up, so
 * the whole title is lowered first. A title that is NOT all capitals keeps the
 * letters it has past each word's first ("BBQ", "McCormick"): only the first
 * letters change, and a small word written with a capital is lowered.
 */
export function toTitleCase(title: string): string {
  const base = isAllCaps(title) ? title.toLocaleLowerCase() : title;
  const tokens = base.split(/(\s+)/);
  const wordIndexes = tokens.map((token, index) => (/\S/.test(token) ? index : -1)).filter((i) => i >= 0);
  const first = wordIndexes[0];
  const last = wordIndexes[wordIndexes.length - 1];
  return tokens
    .map((token, index) => {
      if (!/\S/.test(token)) return token;
      const previous = wordIndexes[wordIndexes.indexOf(index) - 1];
      const afterColon = previous !== undefined && /[:.!?]$/.test(tokens[previous]);
      const edge = index === first || index === last || afterColon;
      // Hyphenated words take a capital on each part ("Stir-Fry").
      return token
        .split("-")
        .map((part, partIndex) => {
          const bare = part.toLocaleLowerCase().replace(/[^a-z]/g, "");
          if (MINOR_WORDS.has(bare) && !edge && partIndex === 0) return part.toLocaleLowerCase();
          return capitalize(part);
        })
        .join("-");
    })
    .join("");
}

/** Whether pressing "Title case" would change nothing. */
export function isTitleCase(title: string): boolean {
  return HAS_LETTER.test(title) && !isAllCaps(title) && title === toTitleCase(title);
}
