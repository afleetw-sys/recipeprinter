"use client";

/**
 * Notices when a cook keeps doing the same thing, which usually means it
 * isn't working for them, and asks what went wrong in a small card in the
 * corner (components/StrugglePrompt.tsx). Two signals so far:
 *
 *  - print: the same recipes printed `PRINT_REPEATS` times within
 *    `PRINT_WINDOW_MS`, however close together. Counted when each press's
 *    spinner comes down, so a press the spinner swallowed isn't counted.
 *    Printing a different recipe after the post-print "Change recipe" is a
 *    new set of recipes, not a repeat.
 *  - import: the same link or pasted text imported again within
 *    `IMPORT_WINDOW_MS`, but not within `IMPORT_MIN_GAP_MS` (one hand-off
 *    seen twice, not a cook trying again). A link already on the page is
 *    focused, not re-imported (lib/queue `findDuplicateImport`), so this only
 *    sees a real second import: after a failure or a removal.
 *
 * Each kind is asked about at most once per `ASK_COOLDOWN_MS` per browser, and
 * everything lives in localStorage: losing it only means asking a little
 * early or a little late.
 */

export type StruggleKind = "print" | "import";

const PRINT_REPEATS = 3;
const PRINT_WINDOW_MS = 30 * 60_000;
const IMPORT_WINDOW_MS = 60 * 60_000;
const IMPORT_MIN_GAP_MS = 5_000;
const ASK_COOLDOWN_MS = 30 * 24 * 60 * 60_000;

const PRINTS_KEY = "rp-struggle:prints:v1";
const IMPORTS_KEY = "rp-struggle:imports:v1";
const askedKey = (kind: StruggleKind) => `rp-struggle:asked:${kind}:v1`;

export const STRUGGLE_PROMPT_EVENT = "rp:struggle-prompt";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: we just won't notice repeats.
  }
}

function askedRecently(kind: StruggleKind, now: number): boolean {
  const at = read<number>(askedKey(kind), 0);
  return now - at < ASK_COOLDOWN_MS;
}

/** The card has been shown; don't ask about this kind again for a while. */
export function markStrugglePromptShown(kind: StruggleKind, now: number = Date.now()): void {
  write(askedKey(kind), now);
}

function request(kind: StruggleKind, now: number): void {
  if (askedRecently(kind, now)) return;
  window.dispatchEvent(new CustomEvent<StruggleKind>(STRUGGLE_PROMPT_EVENT, { detail: kind }));
}

/**
 * One press of Print, once its spinner is down. `deckKey` names the recipes
 * printed (their ids), so printing a different recipe starts a fresh count.
 */
export function notePrintPress(deckKey: string, now: number = Date.now()): void {
  if (typeof window === "undefined" || !deckKey) return;
  const prev = read<{ deck: string; at: number[] }>(PRINTS_KEY, { deck: "", at: [] });
  const at = [...(prev.deck === deckKey ? prev.at.filter((t) => now - t < PRINT_WINDOW_MS) : []), now];
  write(PRINTS_KEY, { deck: deckKey, at });
  if (at.length >= PRINT_REPEATS) request("print", now);
}

/** An import began. `dedupeKey` is the meter's: the canonical link or normalized paste. */
export function noteImportStarted(dedupeKey: string | undefined, now: number = Date.now()): void {
  if (typeof window === "undefined" || !dedupeKey) return;
  const seen = read<Record<string, number>>(IMPORTS_KEY, {});
  const fresh: Record<string, number> = {};
  for (const [key, at] of Object.entries(seen)) if (now - at < IMPORT_WINDOW_MS) fresh[key] = at;
  // Short, so a long recipe paste isn't kept whole in storage.
  const key = shortHash(dedupeKey);
  const before = fresh[key];
  fresh[key] = now;
  write(IMPORTS_KEY, fresh);
  if (before !== undefined && now - before >= IMPORT_MIN_GAP_MS) request("import", now);
}

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
