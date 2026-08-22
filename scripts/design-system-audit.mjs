import fs from "node:fs";
import path from "node:path";
import { stripCssComments, stripJsComments } from "./stripComments.mjs";

const root = process.cwd();
const failures = [];

/**
 * Source with its comments blanked out, split into lines.
 *
 * Every rule below is a pattern that only means anything in real code, so a
 * comment that merely NAMES one is not a violation — it is usually the note
 * explaining why the real code nearby is the way it is. Scanning raw text made
 * this audit fail on print.css:2177, a comment describing what `font-size: 0`
 * does to a collapsed label, which it read as a `font-size` declaration.
 *
 * `stripComments` preserves length and line breaks, so `index + 1` is still the
 * line number in the file the developer will open.
 */
function scannableLines(file, source) {
  const stripped = file.endsWith(".css") ? stripCssComments(source) : stripJsComments(source);
  return stripped.split("\n");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function report(file, line, message) {
  failures.push(`${path.relative(root, file)}:${line}: ${message}`);
}

const exemptTsx = new Set([
  "app/opengraph-image.tsx", // generated brand artwork
  "app/print/harness/LayoutHarness.tsx", // internal diagnostic UI
  "components/RecipeCardPrint.tsx", // printable theme artwork
  "components/SiteFooter.tsx", // externally branded Buy Me a Coffee treatment
]);

for (const directory of ["app", "components"]) {
  for (const file of walk(path.join(root, directory)).filter((name) => name.endsWith(".tsx"))) {
    const relative = path.relative(root, file);
    if (exemptTsx.has(relative)) continue;
    const lines = scannableLines(file, fs.readFileSync(file, "utf8"));
    lines.forEach((line, index) => {
      if (/text-\[(?:\d|\.\d)/.test(line)) {
        report(file, index + 1, "use a text-cp-* typography token");
      }
      if (/rounded-\[(?:\d|\.\d)/.test(line)) {
        report(file, index + 1, "use the shared radius scale");
      }
      if (/shadow-\[(?!var\(--cp-)/.test(line)) {
        report(file, index + 1, "use a shadow-cp-* elevation token");
      }
      if (/\bshadow(?:-(?:sm|md|lg|xl|2xl))?\b/.test(line) && !/shadow-cp-/.test(line)) {
        report(file, index + 1, "do not use Tailwind's default shadow scale");
      }
      if (/(?:bg|text|border)-\[(?:#|rgba?\()/.test(line)) {
        report(file, index + 1, "use a named color token");
      }
    });
  }
}

// The center of print.css is printable artwork and intentionally owns its own
// physical-unit type, radii, colors, and shadows. Audit only application UI:
// workspace chrome before the themes and modal chrome after them.
const cssTargets = [
  { file: "app/globals.css", ranges: [[1, Infinity]] },
  {
    file: "app/print/print.css",
    ranges: [[1, 2750]],
    // Use the selector rather than a line number: printable artwork above it
    // legitimately uses physical-unit typography and grows as themes evolve.
    trailingUiMarker: ".print-success-dialog {",
    trailingUiEndMarker: "@page rp-card-6x4 {",
  },
];

for (const target of cssTargets) {
  const file = path.join(root, target.file);
  // Stripped before the marker search too, so a selector quoted in a comment
  // can't be mistaken for the section boundary it names.
  const lines = scannableLines(file, fs.readFileSync(file, "utf8"));
  const trailingUiStart = target.trailingUiMarker
    ? lines.findIndex((line) => line.trim() === target.trailingUiMarker) + 1
    : Infinity;
  const trailingUiEnd = target.trailingUiEndMarker
    ? lines.findIndex((line) => line.trim() === target.trailingUiEndMarker) + 1
    : Infinity;
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (
      !target.ranges.some(([start, end]) => lineNumber >= start && lineNumber <= end) &&
      (lineNumber < trailingUiStart || lineNumber >= trailingUiEnd)
    ) return;
    const font = line.match(/font-size\s*:\s*([^;]+)/)?.[1].trim();
    if (font && !font.startsWith("var(--cp-fs") && font !== "0" && !font.startsWith("clamp(") && !font.endsWith("em")) {
      report(file, lineNumber, "use a --cp-fs-* typography token");
    }
    const shadow = line.match(/box-shadow\s*:\s*([^;]+)/)?.[1].trim();
    if (shadow && !shadow.startsWith("var(--cp-") && shadow !== "none" && !shadow.startsWith("0 0 0")) {
      report(file, lineNumber, "use a --cp-shadow-* elevation token");
    }
  });
}

if (failures.length) {
  console.error("Design-system audit failed:\n");
  console.error(failures.map((failure) => `  ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Design-system audit passed.");
