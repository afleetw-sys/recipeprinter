/**
 * A recipe's note is two things stacked: the blurb its website arrived with,
 * and whatever the cook wrote themselves.
 *
 * They are stored apart (`recipe.description` and `recipe.note`) and shown
 * together, because the settings checkbox turns the website's half on and off
 * and the cook's half must survive that untouched. Storing one combined string
 * would mean the toggle had to guess where one ended and the other began —
 * which is exactly the guess the old "Clear website notes" button asked the
 * COOK to make, and why it went.
 *
 * Nothing is destroyed by toggling. Off is not a delete, it is the website's
 * half not being included, so turning it back on restores it exactly.
 */

/** The separator between the two halves — its own line, so a blurb and a note
    read as two thoughts rather than one run-on sentence. */
const JOIN = "\n";

/** What the card shows, and what the editor opens with. */
export function composeNote(
  description: string | undefined,
  note: string | undefined,
  includeDescription: boolean,
): string {
  const own = note?.trim() ? note : "";
  if (!includeDescription) return own;
  const blurb = description?.trim() ? description : "";
  return [blurb, own].filter(Boolean).join(JOIN);
}

/**
 * Splits an edited note back into its two halves.
 *
 * With the website's half switched OFF the cook is only ever looking at their
 * own words, so everything they typed is theirs and the stored blurb is left
 * alone — it is not on screen and must not be lost by an edit that never saw
 * it.
 *
 * With it ON they are looking at both. Text that still opens with the blurb
 * keeps that split; the rest is theirs. If it no longer does, they have edited
 * the website's words themselves — so those words become theirs, and the
 * separate blurb is dropped rather than left to reappear underneath its own
 * rewrite the next time the box is ticked.
 */
export function splitNote(
  value: string,
  description: string | undefined,
  includeDescription: boolean,
): { description: string | undefined; note: string | undefined } {
  const trimmedEmpty = (s: string) => (s.trim() ? s : undefined);

  if (!includeDescription) {
    return { description, note: trimmedEmpty(value) };
  }
  const blurb = description?.trim() ? description : "";
  if (blurb && value.startsWith(blurb)) {
    const rest = value.slice(blurb.length).replace(/^\r?\n/, "");
    return { description, note: trimmedEmpty(rest) };
  }
  return { description: undefined, note: trimmedEmpty(value) };
}
