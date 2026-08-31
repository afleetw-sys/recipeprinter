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
    // `em` (relative sizing inside printed artwork) is exempt; `rem` is NOT.
    // A bare `endsWith("em")` also matched every `rem` literal in the codebase,
    // which quietly exempted the whole file from the one check this rule
    // exists to make — `font-size: 0.62rem` passed for as long as it stood.
    if (font && !font.startsWith("var(--cp-fs") && font !== "0" && !font.startsWith("clamp(") && !/(^|[\d.])em$/.test(font)) {
      report(file, lineNumber, "use a --cp-fs-* typography token");
    }
    const shadow = line.match(/box-shadow\s*:\s*([^;]+)/)?.[1].trim();
    if (shadow && !shadow.startsWith("var(--cp-") && shadow !== "none" && !shadow.startsWith("0 0 0")) {
      report(file, lineNumber, "use a --cp-shadow-* elevation token");
    }
  });
}

// ── Every --cp-* / --rp-* / --z-* a stylesheet READS must be one it DEFINES ──
// `var()` fails silently: a name with a typo, or one that was never added,
// falls through to its fallback (or to nothing) and ships looking almost
// right. `var(--cp-danger, #b42318)` sat in print.css doing exactly that —
// painting the section-delete hover in a red that matched nothing else in the
// product, because the token is called --cp-error.
{
  const sources = ["app/globals.css", "app/print/print.css"].map((name) => ({
    name,
    text: stripCssComments(fs.readFileSync(path.join(root, name), "utf8")),
  }));
  // A custom property counts as defined wherever it is SET — :root, a component
  // selector, a JSX `style` object, or a next/font `variable`. The bug this
  // catches is a name that is set nowhere at all.
  const defined = new Set();
  for (const { text } of sources) {
    for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]);
  }
  for (const directory of ["app", "components", "lib"]) {
    for (const file of walk(path.join(root, directory)).filter((n) => /\.tsx?$/.test(n))) {
      const text = fs.readFileSync(file, "utf8");
      // Also `["--rp-spine-w" as string]: ...` — the cast sits between the
      // closing quote and the colon, so skip anything up to that colon.
      for (const match of text.matchAll(/["'`](--[\w-]+)["'`][^:,\n]*[:,]/g)) defined.add(match[1]);
      for (const match of text.matchAll(/variable:\s*["'`](--[\w-]+)/g)) defined.add(match[1]);
    }
  }
  for (const { name, text } of sources) {
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!defined.has(match[1])) {
          report(path.join(root, name), index + 1, `${match[1]} is not defined in :root`);
        }
      }
    });
  }
}

// ── A shared component is defined once, in globals.css ──
// print.css loads AFTER globals.css on /print, so any selector it restates
// wins ties on source order alone — silently, and only on this one route. That
// is how the workspace ended up with a second copy of .control-checkbox whose
// own comment noted the layered original had stopped having any effect.
// Page CSS may position and compose; restating a shared component is the bug.
{
  const selectorsOf = (name) => {
    const text = stripCssComments(fs.readFileSync(path.join(root, name), "utf8"));
    const found = new Map();
    // Keyframe steps (`from`, `to`, `50%`) are per-animation, never shared
    // components — two animations legitimately both have a `from`.
    const keyframeStep = /^(from|to|[\d.]+%)$/;
    for (const match of text.matchAll(/([^{}@;][^{}]*?)\{/g)) {
      const selector = match[1].trim();
      if (!selector || selector.includes("@")) continue;
      const line = text.slice(0, match.index).split("\n").length;
      for (const part of selector.split(",")) {
        const one = part.trim();
        if (!one || keyframeStep.test(one)) continue;
        if (!found.has(one)) found.set(one, line);
      }
    }
    return found;
  };
  const shared = selectorsOf("app/globals.css");
  // Layout that the page legitimately owns on top of a shared shell.
  const allowed = new Set([".recipe-print-shell"]);
  for (const [selector, line] of selectorsOf("app/print/print.css")) {
    if (!shared.has(selector) || allowed.has(selector)) continue;
    report(
      path.join(root, "app/print/print.css"),
      line,
      `${selector} is already defined in app/globals.css:${shared.get(selector)} — page CSS must not restate a shared component`,
    );
  }
}

// ── Cornflower vs clay: the rules from docs/color-roles.md, enforced ──
// A doc nobody can run is a doc that drifts. These are the three ways the
// two-accent split has actually been broken so far, each now a build failure.
{
  // The palette, and the two darkened siblings derived from it. Written out
  // rather than parsed so that renaming a token can never silently empty this
  // list and switch the whole check off.
  const paletteLiterals = [
    ["#f4f7f3", "--cp-page"],
    ["#22303a", "--cp-ink"],
    ["#5f6f79", "--cp-ink-soft"],
    ["#4a6fa8", "--cp-accent"],
    ["#3f6094", "--cp-accent-ink"],
    ["#c96a4c", "--cp-accent-warm"],
    ["#9e4629", "--cp-accent-warm-ink"],
  ];

  // 1. A palette colour written as a literal is a copy that stops following the
  //    token. Only :root may hold the values. print.css is exempt below the UI
  //    ranges because printed artwork owns its own `--recipe-*` palette and
  //    legitimately spells colours out (Classic's clay bullet, for one).
  {
    const file = path.join(root, "app/globals.css");
    const lines = scannableLines(file, fs.readFileSync(file, "utf8"));
    const rootEnd = lines.findIndex((line, index) => index > 0 && line.trim() === "}");
    lines.forEach((line, index) => {
      if (index <= rootEnd) return;
      for (const [hex, token] of paletteLiterals) {
        if (line.toLowerCase().includes(hex)) {
          report(file, index + 1, `${hex} is the ${token} palette value — use var(${token})`);
        }
      }
    });
  }
  for (const directory of ["app", "components"]) {
    for (const file of walk(path.join(root, directory)).filter((n) => n.endsWith(".tsx"))) {
      if (exemptTsx.has(path.relative(root, file))) continue;
      scannableLines(file, fs.readFileSync(file, "utf8")).forEach((line, index) => {
        for (const [hex, token] of paletteLiterals) {
          if (line.toLowerCase().includes(hex)) {
            report(file, index + 1, `${hex} is the ${token} palette value — use var(${token})`);
          }
        }
      });
    }
  }

  // 2. Neither base accent is ever TEXT. Clay is 3.7:1 on card and cornflower
  //    is only comfortable at large sizes; both have an -ink sibling that is
  //    AA-safe everywhere, and that is what a glyph or a label reads from.
  for (const name of ["app/globals.css", "app/print/print.css"]) {
    const file = path.join(root, name);
    scannableLines(file, fs.readFileSync(file, "utf8")).forEach((line, index) => {
      const match = line.match(/(?:^|[\s;{])color\s*:\s*var\(\s*(--cp-accent|--cp-accent-warm)\s*\)/);
      if (match) {
        report(file, index + 1, `${match[1]} is a fill and a border, never text — use ${match[1]}-ink`);
      }
    });
  }
  for (const directory of ["app", "components"]) {
    for (const file of walk(path.join(root, directory)).filter((n) => n.endsWith(".tsx"))) {
      if (exemptTsx.has(path.relative(root, file))) continue;
      scannableLines(file, fs.readFileSync(file, "utf8")).forEach((line, index) => {
        const match = line.match(/text-\[var\((--cp-accent|--cp-accent-warm)\)\]/);
        if (match) {
          report(file, index + 1, `${match[1]} is a fill and a border, never text — use ${match[1]}-ink`);
        }
      });
    }
  }

  // 3. Text sitting ON a filled accent takes the on-accent token. The right
  //    answer flips with the accent — against the old teal, ink won at 1.95:1;
  //    against cornflower, ink is 2.66:1 and white wins — so hand-picking it at
  //    each call site is how the signed-in avatar ended up as the least legible
  //    text in the app.
  const onAccent = [
    ["--cp-accent", "--cp-on-accent"],
    ["--cp-accent-warm-ink", "--cp-on-accent-warm"],
  ];
  for (const name of ["app/globals.css", "app/print/print.css"]) {
    const file = path.join(root, name);
    const text = stripCssComments(fs.readFileSync(file, "utf8"));
    for (const block of text.matchAll(/\{([^{}]*)\}/g)) {
      const body = block[1];
      const colour = body.match(/(?:^|[\s;])color\s*:\s*([^;]+)/)?.[1].trim();
      if (!colour) continue;
      for (const [fill, expected] of onAccent) {
        const filled = new RegExp(`background(?:-color)?\\s*:\\s*var\\(\\s*${fill}\\s*\\)`).test(body);
        if (filled && colour !== `var(${expected})`) {
          const line = text.slice(0, block.index).split("\n").length;
          report(file, line, `text on a filled ${fill} must be var(${expected}), not ${colour}`);
        }
      }
    }
  }
  for (const directory of ["app", "components"]) {
    for (const file of walk(path.join(root, directory)).filter((n) => n.endsWith(".tsx"))) {
      if (exemptTsx.has(path.relative(root, file))) continue;
      scannableLines(file, fs.readFileSync(file, "utf8")).forEach((line, index) => {
        if (/bg-\[var\(--cp-accent\)\]/.test(line) && /text-\[var\(--cp-(?:ink|accent-ink)/.test(line)) {
          report(file, index + 1, "text on a filled --cp-accent must be var(--cp-on-accent)");
        }
      });
    }
  }
}

if (failures.length) {
  console.error("Design-system audit failed:\n");
  console.error(failures.map((failure) => `  ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Design-system audit passed.");
