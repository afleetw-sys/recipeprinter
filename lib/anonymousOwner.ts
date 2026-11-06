import { localStore } from "@/lib/storage";
import { uid } from "@/lib/ids";

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
 *
 * Kept in a cookie as well as localStorage. The free import meter counts a
 * signed-out cook by this id, and on 2026-11-05 three cooks came back to
 * /print from a Google result to a tab whose localStorage was empty (or a
 * different one), so the meter met a new browser and answered "0 of 10 used".
 * PostHog's cookie on the same device came through every one of those visits.
 * The cookie wins when the two disagree, and each read writes the id back to
 * both, so whichever one a browser drops is refilled on the next visit.
 */
export const ANONYMOUS_OWNER_STORAGE_KEY = "recipeprinter:anonymous-owner:v1";
export const ANONYMOUS_OWNER_COOKIE = "rp_anon";

// 400 days is the longest any browser keeps a cookie (Chrome's cap).
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
// What CookPilot accepts as an `rpAnonId`, so a mangled cookie is never sent.
const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function readCookie(): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${ANONYMOUS_OWNER_COOKIE}=([^;]*)`));
    return match && ID_PATTERN.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

function writeCookie(id: string): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ANONYMOUS_OWNER_COOKIE}=${id}; Max-Age=${COOKIE_MAX_AGE_S}; path=/; SameSite=Lax${secure}`;
  } catch {
    /* No cookie jar (server render, or cookies blocked): localStorage still has it. */
  }
}

export function anonymousOwnerId(): string {
  const stored = localStore.get(ANONYMOUS_OWNER_STORAGE_KEY);
  const id = readCookie() ?? stored ?? uid();
  if (stored !== id) localStore.set(ANONYMOUS_OWNER_STORAGE_KEY, id);
  writeCookie(id);
  return id;
}
