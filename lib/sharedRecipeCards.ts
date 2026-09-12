import type { SharedRecipeCard } from "@/types/sharedRecipeCard";
import { RECIPE_PRINTER_SHARED_CARDS_PATH } from "@/lib/firebase/recipePrinterPaths";
import { stripUndefined } from "@/lib/firebase/stripUndefined";

const SHARED_RECIPE_CARDS_COLLECTION = "sharedRecipeCards";

/* The public REST read (`fetchSharedRecipeCard`) lives in
   sharedRecipeCards.server.ts — it's server-only and React-`cache`-wrapped,
   and `cache` is undefined outside the `react-server` condition, so it can't
   share a module with the client-side writes below. */

/* ── Admin writes (client SDK, auth-gated by Firestore rules) ───────────── */

function isPermissionDeniedError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "permission-denied";
}

async function slugAvailable(slug: string): Promise<boolean> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  try {
    const db = getDb();
    const [next, legacy] = await Promise.all([
      getDoc(doc(db, ...RECIPE_PRINTER_SHARED_CARDS_PATH, slug)).catch(() => null),
      getDoc(doc(db, SHARED_RECIPE_CARDS_COLLECTION, slug)),
    ]);
    return !next?.exists() && !legacy.exists();
  } catch (error) {
    // A denied read here means the doc exists but isn't publicly readable
    // right now (e.g. deactivated) — either way, the slug is taken.
    if (isPermissionDeniedError(error)) return false;
    throw error;
  }
}

export async function createSharedRecipeCard(
  card: Omit<SharedRecipeCard, "createdAt" | "updatedAt" | "published">,
): Promise<void> {
  const [{ doc, setDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  if (!(await slugAvailable(card.slug))) {
    throw new Error("That link is already taken. Try a different one.");
  }
  const now = Date.now();
  const data = stripUndefined<SharedRecipeCard>({
    ...card,
    createdAt: now,
    updatedAt: now,
    published: true,
  });
  await setDoc(doc(getDb(), ...RECIPE_PRINTER_SHARED_CARDS_PATH, card.slug), data);
}

export async function setSharedRecipeCardPublished(slug: string, published: boolean): Promise<void> {
  const [{ doc, updateDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await updateDoc(doc(getDb(), ...RECIPE_PRINTER_SHARED_CARDS_PATH, slug), {
    published,
    updatedAt: Date.now(),
  });
}

