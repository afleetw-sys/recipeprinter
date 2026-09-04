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

/* ── contentEditable ⇄ markers ─────────────────────────────────────────────
   The field edits real formatting, so the DOM is the source of truth while it
   is focused and the marker string is what gets stored on blur. Both
   directions live here, beside the parser, so a round trip cannot drift. */

/** The bit of a DOM node these need. Kept structural rather than importing DOM
    types so the conversion can be exercised in the node test environment. */
export interface NodeLike {
  nodeType: number;
  nodeName: string;
  textContent?: string | null;
  childNodes?: ArrayLike<NodeLike>;
}

const TEXT_NODE = 3;
const BOLD_TAGS = new Set(["B", "STRONG"]);
const ITALIC_TAGS = new Set(["I", "EM"]);

/** Segments → the stored marker string. Adjacent runs of the same style are
    merged, so a browser that split a word across two `<b>` elements (they do)
    does not store `**a****b**`. */
export function segmentsToRichText(segments: readonly RichTextSegment[]): string {
  let out = "";
  let bold = false;
  let italic = false;
  for (const segment of segments) {
    if (!segment.text) continue;
    if (segment.italic !== italic && !segment.italic) out += ITALIC;
    if (segment.bold !== bold && !segment.bold) out += BOLD;
    if (segment.bold !== bold && segment.bold) out += BOLD;
    if (segment.italic !== italic && segment.italic) out += ITALIC;
    out += segment.text;
    bold = segment.bold;
    italic = segment.italic;
  }
  if (italic) out += ITALIC;
  if (bold) out += BOLD;
  return out;
}

/** A contentEditable subtree → styled segments. Unknown elements contribute
    their text and nothing else, which is what makes pasted markup harmless. */
export function nodesToSegments(root: NodeLike): RichTextSegment[] {
  const segments: RichTextSegment[] = [];

  const walk = (node: NodeLike, bold: boolean, italic: boolean) => {
    if (node.nodeType === TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) segments.push({ text, bold, italic });
      return;
    }
    if (node.nodeName === "BR") {
      segments.push({ text: "\n", bold, italic });
      return;
    }
    const nextBold = bold || BOLD_TAGS.has(node.nodeName);
    const nextItalic = italic || ITALIC_TAGS.has(node.nodeName);
    const children = node.childNodes ?? [];
    for (let i = 0; i < children.length; i += 1) walk(children[i], nextBold, nextItalic);
  };

  const children = root.childNodes ?? [];
  for (let i = 0; i < children.length; i += 1) walk(children[i], false, false);
  return segments;
}

/** A contentEditable subtree → the stored marker string. */
export function nodesToRichText(root: NodeLike): string {
  return segmentsToRichText(nodesToSegments(root));
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** Markers → the HTML a contentEditable is seeded with. Text is escaped, and
    the only elements produced are `<strong>`, `<em>` and `<br>` — nothing here
    can inject markup, whatever the recipe text contains. */
export function richTextToHtml(input: string): string {
  return parseRichText(input)
    .map((segment) => {
      const escaped = segment.text
        .replace(/[&<>]/g, (char) => HTML_ESCAPES[char])
        .replace(/\n/g, "<br>");
      if (segment.bold && segment.italic) return `<strong><em>${escaped}</em></strong>`;
      if (segment.bold) return `<strong>${escaped}</strong>`;
      if (segment.italic) return `<em>${escaped}</em>`;
      return escaped;
    })
    .join("");
}
