import type { SharedRecipeCard } from "@/types/sharedRecipeCard";

const SHARED_RECIPE_CARDS_COLLECTION = "sharedRecipeCards";
const FIRESTORE_DATABASE = "(default)";

/* ── Public read (REST, no Admin SDK in this project) ────────────────────
   Mirrors the raw-REST pattern CookPilot's own sharedRecipe.ts uses for its
   (unrelated) `sharedRecipes` collection: a plain `fetch` against the public
   Firestore REST endpoint with the web API key, so both `generateMetadata`
   and the page body can read a doc without needing the Firebase Admin SDK
   (which this project doesn't depend on) — Firestore rules restrict this to
   `published: true` docs only, so it stays safe to call unauthenticated. */

type FirestoreRestValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
  arrayValue?: { values?: FirestoreRestValue[] };
};

type FirestoreRestDocument = { fields?: Record<string, FirestoreRestValue> };

function firestoreDocumentUrl(slug: string): string {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  if (!projectId || !apiKey) {
    throw new Error("Missing Firebase web configuration.");
  }
  const encodedSlug = encodeURIComponent(slug);
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${FIRESTORE_DATABASE}/documents/${SHARED_RECIPE_CARDS_COLLECTION}/${encodedSlug}?key=${apiKey}`;
}

function decodeFirestoreValue(value: FirestoreRestValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, fieldValue]) => [key, decodeFirestoreValue(fieldValue)]),
    );
  }
  return undefined;
}

function decodeFirestoreDocument(document: FirestoreRestDocument | null): Record<string, unknown> | null {
  if (!document?.fields) return null;
  return Object.fromEntries(
    Object.entries(document.fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
}

function isSharedRecipeCard(data: Record<string, unknown> | null): boolean {
  return Boolean(
    data &&
      typeof data.slug === "string" &&
      data.recipe &&
      typeof data.recipe === "object" &&
      typeof data.template === "string" &&
      typeof data.cardSize === "string",
  );
}

/**
 * Reads a `sharedRecipeCards/{slug}` doc straight from Firestore's REST API.
 * Returns `null` for a missing doc, an inactive (`published: false`) doc, or
 * malformed data — callers render one friendly "not found" state for all of
 * these rather than distinguishing them.
 */
export async function fetchSharedRecipeCard(slug: string): Promise<SharedRecipeCard | null> {
  const response = await fetch(firestoreDocumentUrl(slug));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore REST read failed: ${response.status}`);
  }
  const data = decodeFirestoreDocument((await response.json()) as FirestoreRestDocument);
  if (!isSharedRecipeCard(data) || data!.published !== true) return null;
  return data as unknown as SharedRecipeCard;
}

/* ── Admin writes (client SDK, auth-gated by Firestore rules) ───────────── */

function isPermissionDeniedError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "permission-denied";
}

export async function slugAvailable(slug: string): Promise<boolean> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  try {
    const snap = await getDoc(doc(getDb(), SHARED_RECIPE_CARDS_COLLECTION, slug));
    return !snap.exists();
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
  const data = stripUndefined<SharedRecipeCard>({ ...card, createdAt: now, updatedAt: now, published: true });
  await setDoc(doc(getDb(), SHARED_RECIPE_CARDS_COLLECTION, card.slug), data);
}

export async function setSharedRecipeCardPublished(slug: string, published: boolean): Promise<void> {
  const [{ doc, updateDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await updateDoc(doc(getDb(), SHARED_RECIPE_CARDS_COLLECTION, slug), {
    published,
    updatedAt: Date.now(),
  });
}
