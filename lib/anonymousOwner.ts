import { localStore } from "@/lib/storage";

/**
 * The browser's own anonymous identity, in a module with no dependencies but
 * `localStore`.
 *
 * It lived in lib/photoStorage.ts, which is where it is *used* — but that
 * module opens with `firebase/storage`, `firebase/app`, `firebase/auth` and
 * `firebase/app-check`. lib/parser.ts wants only this nine-line function, and
 * importing it pulled that entire SDK into the initial bundle of every page
 * that can import a recipe: the homepage, all sixteen SEO landing pages, and
 * /export. components/AccountControl.tsx spends a whole `next/dynamic`
 * boundary avoiding exactly that cost, and this one import undid it.
 *
 * photoStorage.ts re-exports both names, so nothing that already imports them
 * from there has to change.
 */
export const ANONYMOUS_OWNER_STORAGE_KEY = "recipeprinter:anonymous-owner:v1";

export function anonymousOwnerId(): string {
  const existing = localStore.get(ANONYMOUS_OWNER_STORAGE_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  localStore.set(ANONYMOUS_OWNER_STORAGE_KEY, next);
  return next;
}
