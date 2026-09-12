/**
 * A document with every `undefined` removed, at any depth.
 *
 * Firestore's `setDoc` REJECTS a document containing an explicit `undefined`
 * anywhere, which is the opposite of `JSON.stringify`'s behaviour — that just
 * drops the key. So an optional field left unset throws on write instead of
 * being quietly omitted, and every optional field in this app is a candidate:
 * a project's title, cover, backCover and book-only settings; a shared card's
 * yield, servings, image and per-ingredient amount/unit/note.
 *
 * Recursive because the failure is at any depth — an ingredient's missing
 * `unit` sinks the whole write just as surely as a missing title.
 *
 * Arrays map rather than falling into the object branch, which would turn
 * `["a", "b"]` into `{0: "a", 1: "b"}` — a real corruption, not a type error,
 * since Firestore would accept the object and the read back would no longer be
 * a list.
 *
 * Lived as two identical private copies (lib/printProjects.ts and
 * lib/sharedRecipeCards.ts), each with its own comment explaining the same
 * Firestore rule. One rule, one implementation.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return value;
}
