/**
 * Blanks out comments, leaving everything else — including every line break and
 * every character position — exactly where it was.
 *
 * Written for scripts/design-system-audit.mjs, which scans source line by line
 * and reports line numbers. It was matching its own rules inside COMMENTS: a
 * note in print.css explaining that `font-size: 0` hides a label read as a
 * `font-size: 0` declaration, so the audit failed on a line that declares
 * nothing. A guard that is both red and wrong is a guard nobody runs, which is
 * how a design-system audit ends up not auditing anything.
 *
 * Blanking rather than deleting is what keeps the fix cheap: the caller still
 * splits on "\n" and still reports `index + 1`, because a stripped file has the
 * same shape as the original.
 *
 * Two things have to be understood well enough not to be mistaken for comments:
 *
 *  - String literals. `"https://example.com"` is not a line comment.
 *  - Regex literals. `/^https?:\/\//i` (app/print/[slug]/page.tsx) contains
 *    `\/\/`, and a stripper that only knew about strings would treat that as a
 *    line comment and blank the rest of the line — silently hiding whatever
 *    followed it from the audit.
 *
 * Regex-versus-division is genuinely ambiguous in JavaScript without a real
 * parser, so this uses the standard heuristic: a `/` opens a regex unless the
 * previous significant character could have ended a value. The one shape it
 * gets wrong is `return /re/` (the heuristic sees the `n` and assumes
 * division). That costs a false negative on such a line, never a false
 * positive, and no such line exists here.
 */

/** Characters that can end a value, so a following `/` is division. */
const ENDS_A_VALUE = /[A-Za-z0-9_$)\]]/;

/**
 * @param {string} source
 * @param {{ lineComments?: boolean, regexLiterals?: boolean }} options
 *   `lineComments` — treat `//` as a comment. Off for CSS, which has no line
 *   comments and does have `https://` inside `url()`.
 *   `regexLiterals` — recognise `/.../` literals so their contents are never
 *   read as comments. Only meaningful for JavaScript-family sources.
 */
export function stripComments(source, { lineComments = false, regexLiterals = false } = {}) {
  const out = source.split("");
  let mode = "code";
  let start = 0;
  // Previous significant (non-whitespace) character seen in code, for the
  // regex-versus-division call above.
  let prev = "";
  // A `/` inside a character class doesn't close the regex: /[/]/ is valid.
  let inCharClass = false;

  const blank = (from, to) => {
    for (let i = from; i < to; i += 1) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];

    switch (mode) {
      case "code":
        if (c === "/" && next === "*") {
          mode = "block";
          start = i;
          i += 1;
        } else if (lineComments && c === "/" && next === "/") {
          // A regex can never open with an unescaped `/` (that would close an
          // empty one), so `//` in code position is always a line comment.
          mode = "line";
          start = i;
          i += 1;
        } else if (c === '"' || c === "'" || c === "`") {
          mode = c;
          prev = c;
        } else if (regexLiterals && c === "/" && !ENDS_A_VALUE.test(prev)) {
          mode = "regex";
          inCharClass = false;
        } else if (!/\s/.test(c)) {
          prev = c;
        }
        break;

      case "block":
        if (c === "*" && next === "/") {
          blank(start, i + 2);
          mode = "code";
          // A block comment separates tokens; it can't itself end a value.
          prev = "";
          i += 1;
        }
        break;

      case "line":
        if (c === "\n") {
          blank(start, i);
          mode = "code";
          prev = "";
        } else if (i === source.length - 1) {
          blank(start, source.length);
          mode = "code";
        }
        break;

      case "regex":
        if (c === "\\") {
          i += 1;
        } else if (c === "[") {
          inCharClass = true;
        } else if (c === "]") {
          inCharClass = false;
        } else if (c === "/" && !inCharClass) {
          mode = "code";
          // The literal (and any flags) end a value.
          prev = "/";
        }
        break;

      // '"', "'", "`" — string literals, left entirely intact.
      default:
        if (c === "\\") {
          i += 1;
        } else if (c === mode) {
          mode = "code";
          prev = c;
        }
        break;
    }
  }

  // An unterminated block comment runs to the end of the file.
  if (mode === "block" || mode === "line") blank(start, source.length);

  return out.join("");
}

/** CSS: block comments only. */
export function stripCssComments(source) {
  return stripComments(source, { lineComments: false, regexLiterals: false });
}

/** TypeScript / TSX: block and line comments, regex literals understood. */
export function stripJsComments(source) {
  return stripComments(source, { lineComments: true, regexLiterals: true });
}
