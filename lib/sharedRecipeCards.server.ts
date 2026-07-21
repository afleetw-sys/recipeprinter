import { cache } from "react";
import type { SharedRecipeCard } from "@/types/sharedRecipeCard";

const SHARED_RECIPE_CARDS_COLLECTION = "sharedRecipeCards";
const FIRESTORE_DATABASE = "(default)";

/* ── Public read (REST, no Admin SDK in this project) ────────────────────
   Mirrors the raw-REST pattern CookPilot's own sharedRecipe.ts uses for its
   (unrelated) `sharedRecipes` collection: a plain `fetch` against the public
   Firestore REST endpoint with the web API key, so both `generateMetadata`
   and the page body can read a doc without needing the Firebase Admin SDK
   (which this project doesn't depend on) — Firestore rules restrict this to
   `published: true` docs only, so it stays safe to call unauthenticated.

   Server-only, and deliberately in its own module rather than alongside the
   admin writes in sharedRecipeCards.ts: `cache` below is exported from React
   only under the `react-server` condition, so it's `undefined` in a client
   bundle. sharedRecipeCards.ts is imported by client components
   (AdminShareLinkDialog, SharedRecipeCardRedirect), and a module-scope
   `cache(...)` call there would throw at import time in the browser. The two
   halves share no helpers, so splitting costs nothing and keeps the REST
   decoding out of the client bundle as a bonus. */

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
 *
 * `cache: "no-store"` is deliberate: an unadorned `fetch` in a Next.js Server
 * Component defaults to `force-cache`, which would let an admin's "deactivate
 * this link" go unnoticed by already-cached visitors until the route happens
 * to revalidate. Correctness (a deactivated link actually stops working)
 * matters more here than saving reads.
 *
 * Wrapped in React's `cache` because `no-store` also opts the fetch out of
 * Next's own per-request memoization, and every render of this route calls
 * this twice — once in `generateMetadata`, once in the page body — which
 * measured as two real Firestore reads ~10ms apart for a single page view.
 * `cache` dedupes within a request (both calls share one render pass) without
 * caching anything *across* requests, so a deactivated link still stops
 * working on the very next visit. Keep the two callers passing the same slug
 * or they'll miss each other's entry.
 */
export const fetchSharedRecipeCard = cache(
  async (slug: string): Promise<SharedRecipeCard | null> => {
    const response = await fetch(firestoreDocumentUrl(slug), { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Firestore REST read failed: ${response.status}`);
    }
    const data = decodeFirestoreDocument((await response.json()) as FirestoreRestDocument);
    if (!isSharedRecipeCard(data) || data!.published !== true) return null;
    return data as unknown as SharedRecipeCard;
  },
);
