// The line under a chapter opener's title. Left alone, it names the recipes
// that actually live in the chapter ("Authentic Italian Pizza, Bourbon Chicken,
// and 5 more recipes") rather than printing the same generic sentence in every
// book. No terminal period: it is a label under a title, set the way a chapter
// opener's standfirst is set in a printed book, not a sentence in a paragraph. Derived, never stored: the opener is rebuilt from the section's items
// on every pack, so dragging a recipe from one chapter to another re-words both
// openers the same way it re-numbers the table of contents.
//
// Pure on purpose (no React, no DOM) so the wording rules are unit-tested
// rather than eyeballed in a preview.

/** Printed when a chapter has no recipes under it yet — there is nothing to
    name, and a blank line under the title reads like a bug. */
export const DEFAULT_CHAPTER_INTRO =
  "A handful of recipes worth making again and again";

/**
 * The whole sentence's budget, measured in characters, not the titles' — how
 * many names fit is a question about the finished line.
 *
 * Two lines of the opener's italic intro at Letter size (25pt × 0.62 over a
 * 4.6in column ≈ 46 characters a line), which is as much as the opener can give
 * the line without crowding the chapter title above it. Every candidate below
 * is measured against this, so the opener never runs to a third line no matter
 * how the chapter is filled.
 */
const LINE_BUDGET = 86;

/** Two names is the house style. A chapter of three gets all three when they
    fit, rather than the faintly silly "A, B, and 1 more recipe". */
const MAX_NAMES = 2;
const MAX_NAMES_WHEN_ALL_FIT = 3;

/** Recipe titles arrive from the parser and from hand editing, so they carry
    stray newlines, double spaces, and trailing punctuation that would read as a
    typo mid-sentence. */
function cleanTitle(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().replace(/[.,;:·—–-]+$/, "").trim();
}

function recipeWord(count: number): string {
  return count === 1 ? "recipe" : "recipes";
}

/** Oxford comma, because these are book pages. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** One candidate sentence: these names, plus however many recipes they leave
    unnamed. */
function line(names: string[], rest: number): string {
  if (rest === 0) return joinNames(names);
  const tail = `${rest} more ${recipeWord(rest)}`;
  // "Pizza, and 5 more recipes" wants the comma only once there's a list for it
  // to separate.
  return names.length === 1
    ? `${names[0]} and ${tail}`
    : `${names.join(", ")}, and ${tail}`;
}

/**
 * A chapter's recipe titles, in book order — the input the opener's default
 * intro is built from.
 *
 * Structural on purpose: both callers (the packer that builds the opener sheet
 * and the toolbar that offers to restore the derived line) hold the same
 * section items, and reading the title the same way in one place is what keeps
 * the line the toolbar promises identical to the line the page prints. A queue
 * item carries its own `title` until parsing resolves the recipe's.
 */
export function chapterRecipeTitles(
  items: readonly { title?: string; recipe?: { title?: string } }[],
): string[] {
  return items
    .map((item) => item.recipe?.title?.trim() || item.title?.trim())
    .filter((title): title is string => Boolean(title));
}

/**
 * The chapter opener's default intro, built from the titles of the recipes
 * filed under it (in book order).
 */
export function chapterIntroFromRecipes(titles: readonly (string | undefined)[] = []): string {
  const cleaned = titles.map(cleanTitle).filter(Boolean);
  const total = cleaned.length;
  if (total === 0) return DEFAULT_CHAPTER_INTRO;

  // Two recipes that happen to share a title would print as "Pizza, Pizza, and
  // 3 more" — name distinct dishes and let the duplicate fall into the count.
  const seen = new Set<string>();
  const distinct = cleaned.filter((title) => {
    const key = title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Name as many as the line can hold, giving up one name at a time. A chapter
  // whose first title alone overruns the budget — a recipe titled like a
  // paragraph — is summarized by count instead of cut mid-word, since a
  // truncated recipe title in print reads as damage rather than as brevity.
  const ceiling = Math.min(
    distinct.length,
    total <= MAX_NAMES_WHEN_ALL_FIT ? MAX_NAMES_WHEN_ALL_FIT : MAX_NAMES,
  );
  for (let count = ceiling; count >= 1; count -= 1) {
    const candidate = line(distinct.slice(0, count), total - count);
    if (candidate.length <= LINE_BUDGET) return candidate;
  }
  return `${total} ${recipeWord(total)} in this chapter`;
}
