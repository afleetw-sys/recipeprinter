import type { SharedRecipeCard } from "@/types/sharedRecipeCard";
import { RECIPE_PRINTER_SHARED_CARDS_PATH } from "@/lib/firebase/recipePrinterPaths";

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

// Recipe/RecipeIngredient/RecipeInstruction have several optional fields
// (yield, servings, image, per-ingredient amount/unit/note, ...). Firestore's
// setDoc rejects a document containing an explicit `undefined` anywhere,
// unlike JSON.stringify (which just drops it) — so an unset optional field on
// the recipe being shared throws instead of silently omitting the key.
function stripUndefined<T>(value: T): T {
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
    viewCount: 0,
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

/**
 * Rough, best-effort visit counter — bumped once per browser page load (see
 * SharedRecipeCardRedirect's mount effect), not a detailed analytics log. Uses a
 * scoped Firestore rule that allows anyone to increment just this field by
 * exactly 1, so visitors never need to be signed in and can never touch
 * anything else on the doc.
 */
export async function incrementSharedRecipeCardViewCount(slug: string): Promise<void> {
  const [{ doc, increment, updateDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await updateDoc(doc(getDb(), ...RECIPE_PRINTER_SHARED_CARDS_PATH, slug), {
    viewCount: increment(1),
  });
}
