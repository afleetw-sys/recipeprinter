/**
 * Bold and italic inside a recipe's own text.
 *
 * Stored as markers in the SAME plain strings the fields already hold —
 * `**bold**`, `*italic*` — rather than as HTML or a new node type. Three
 * reasons, all of them about what already exists:
 *
 *  - the fields are edited in ordinary `<textarea>`/`<input>` elements, and
 *    wrapping a selection is something those can do natively. Rich text would
 *    have meant `contentEditable`, which is a rewrite of every inline field;
 *  - nothing in the saved document changes shape, so every cookbook saved
 *    before this opens unchanged and no migration is needed;
 *  - a marker that is never parsed degrades to visible punctuation, not to a
 *    broken page — which is the failure you want in a book someone prints.
 *
 * The cost is that `*` becomes meaningful, so parsing is deliberately strict:
 * a marker only opens when it is followed by non-space and only closes when
 * preceded by non-space, and an unmatched marker stays literal. "2 * 3" and a
 * lone asterisk survive as themselves.
 */

export interface RichTextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

const BOLD = "**";
const ITALIC = "*";

/**
 * Splits text into styled runs. Never throws, never drops characters: the
 * concatenated `text` of the result always equals the input with its matched
 * markers removed, which is what `stripRichText` returns.
 */
export function parseRichText(input: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let plain = "";
  let bold = false;
  let italic = false;
  let i = 0;

  const flush = () => {
    if (plain) segments.push({ text: plain, bold, italic });
    plain = "";
  };

  // A marker only counts when the run it opens is actually closed later, so an
  // unmatched `*` is punctuation rather than a switch that never flips back.
  const closes = (marker: string, from: number): boolean => {
    for (let j = from; j <= input.length - marker.length; j += 1) {
      if (!input.startsWith(marker, j)) continue;
      if (marker === ITALIC && input.startsWith(BOLD, j)) continue;
      if (/\s/.test(input[j - 1] ?? " ")) continue;
      return true;
    }
    return false;
  };

  while (i < input.length) {
    const isBold = input.startsWith(BOLD, i);
    const isItalic = !isBold && input.startsWith(ITALIC, i);
    const marker = isBold ? BOLD : isItalic ? ITALIC : null;

    if (marker) {
      const active = isBold ? bold : italic;
      const next = input[i + marker.length];
      const prev = input[i - 1];
      // Opening: must be followed by something other than space.
      const opening = !active && next !== undefined && !/\s/.test(next) && closes(marker, i + marker.length);
      // Closing: must be preceded by something other than space.
      const closing = active && prev !== undefined && !/\s/.test(prev);
      if (opening || closing) {
        flush();
        if (isBold) bold = !bold;
        else italic = !italic;
        i += marker.length;
        continue;
      }
    }
    plain += input[i];
    i += 1;
  }

  flush();
  return segments;
}

/** The text without its formatting markers — what layout measures, and what
    goes anywhere styling cannot follow (contents entries, rail labels, the
    document title, a filename). */
export function stripRichText(input: string): string {
  return parseRichText(input)
    .map((segment) => segment.text)
    .join("");
}

/** Whether text carries any formatting at all — lets callers skip the parse. */
export function hasRichText(input: string): boolean {
  return input.includes(ITALIC) && parseRichText(input).some((s) => s.bold || s.italic);
}

export interface SelectionEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Bold/italic applied to a selection, the way Cmd+B behaves in any editor:
 * wraps it, or unwraps it if it is already wrapped. With nothing selected it
 * drops in an empty pair and puts the cursor between them, so the shortcut can
 * be pressed before typing rather than only after.
 *
 * Returns the new value AND where the selection should land, because a caret
 * left where it was would sit inside the markers it just added.
 */
export function toggleRichText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  style: "bold" | "italic",
): SelectionEdit {
  const marker = style === "bold" ? BOLD : ITALIC;
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  // For italic, a neighbouring `**` is BOLD, not a pair of italic markers —
  // without this, italicising an already-bold selection stripped its bold
  // instead of adding to it.
  const boldNeighbour = style === "italic" && (before.endsWith(BOLD) || after.startsWith(BOLD));

  // Already wrapped, markers just outside the selection: unwrap.
  if (!boldNeighbour && before.endsWith(marker) && after.startsWith(marker)) {
    const trimmedBefore = before.slice(0, -marker.length);
    return {
      value: trimmedBefore + selected + after.slice(marker.length),
      selectionStart: trimmedBefore.length,
      selectionEnd: trimmedBefore.length + selected.length,
    };
  }

  // Already wrapped, markers inside the selection: unwrap those instead.
  const boldInside =
    style === "italic" && selected.startsWith(BOLD) && selected.endsWith(BOLD);
  if (
    !boldInside &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    selected.length > marker.length * 2
  ) {
    const inner = selected.slice(marker.length, -marker.length);
    return {
      value: before + inner + after,
      selectionStart: before.length,
      selectionEnd: before.length + inner.length,
    };
  }

  return {
    value: `${before}${marker}${selected}${marker}${after}`,
    selectionStart: before.length + marker.length,
    selectionEnd: before.length + marker.length + selected.length,
  };
}
