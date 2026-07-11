"use client";

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/db";
import { adaptCookPilotRecipe } from "@/lib/cookpilot";
import type { QueueItem, Recipe } from "@/types/recipe";

type AnyRecord = Record<string, unknown>;
const DETAIL_LOAD_CONCURRENCY = 5;

export interface CookPilotRecipeSummary {
  id: string;
  title: string;
  imageURL?: string;
  sourceURL?: string;
  createdAt: Date;
  servings?: string | number;
  preferredServings?: string | number;
  ingredientNames: string[];
  totalTimeMinutes?: number;
  tags: string[];
  systemTags: string[];
}

interface CookPilotRecipeDetail {
  schemaVersion?: number;
  description?: string | null;
  imageURL?: string | null;
  imageUrl?: string | null;
  image?: unknown;
  images?: unknown;
  prepTime?: string | null;
  cookTime?: string | null;
  ingredientSections: unknown[];
  instructionSections: unknown[];
  nutrition?: unknown;
}

function asDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function decodeSummary(snapshot: QueryDocumentSnapshot<DocumentData>): CookPilotRecipeSummary {
  const data = snapshot.data();
  const title = asString(data.title) ?? "Untitled recipe";

  return {
    id: snapshot.id,
    title,
    imageURL: asString(data.imageURL) ?? asString(data.imageUrl),
    sourceURL: asString(data.sourceURL),
    createdAt: asDate(data.createdAt),
    servings: asString(data.servings) ?? asNumber(data.servings),
    preferredServings: asString(data.preferredServings) ?? asNumber(data.preferredServings),
    ingredientNames: asStringArray(data.ingredientNames),
    totalTimeMinutes: asNumber(data.totalTimeMinutes),
    tags: asStringArray(data.tags),
    systemTags: asStringArray(data.systemTags),
  };
}

function recipesCollection(userId: string) {
  return collection(getDb(), "users", userId, "recipes");
}

function recipeDetailRef(userId: string, recipeId: string) {
  return doc(getDb(), "users", userId, "recipes", recipeId, "detail", "main");
}

export function cookPilotQueueId(recipeId: string): string {
  return `cookpilot:${recipeId}`;
}

// A library can grow large, so the picker fetches it a page at a time and
// loads more as the user scrolls, rather than reading every recipe on tab
// open. Search is the one exception (see loadAllCookPilotRecipeSummaries):
// it needs to see the whole library, not just whatever's scrolled into view.
const SUMMARY_PAGE_SIZE = 30;

interface SummaryPageState {
  summaries: CookPilotRecipeSummary[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  // Dedupes overlapping calls (e.g. a fast scroll firing the intersection
  // observer more than once before the previous page has resolved).
  pending: Promise<CookPilotRecipeSummary[]> | null;
}

// Summaries rarely change within a session, and the picker unmounts every time
// the import tab switches away. Cache per-user so coming back to the CookPilot
// tab is instant instead of re-fetching from scratch each time.
const summaryCache = new Map<string, SummaryPageState>();

/** Synchronously read already-loaded summaries, or null if not yet fetched. */
export function getCachedCookPilotSummaries(
  userId: string,
): CookPilotRecipeSummary[] | null {
  return summaryCache.get(userId)?.summaries ?? null;
}

/** Whether there are more, not-yet-loaded summaries for this user. */
export function hasMoreCookPilotSummaries(userId: string): boolean {
  return summaryCache.get(userId)?.hasMore ?? true;
}

async function fetchSummaryPage(
  userId: string,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<{
  summaries: CookPilotRecipeSummary[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  const constraints = cursor
    ? [orderBy("createdAt", "desc"), startAfter(cursor), limit(SUMMARY_PAGE_SIZE)]
    : [orderBy("createdAt", "desc"), limit(SUMMARY_PAGE_SIZE)];
  const snapshot = await getDocs(query(recipesCollection(userId), ...constraints));
  return {
    summaries: snapshot.docs.map(decodeSummary),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? cursor,
    hasMore: snapshot.docs.length === SUMMARY_PAGE_SIZE,
  };
}

/** Loads the first page, or returns the cached one if already fetched. */
export async function loadCookPilotRecipeSummaries(
  userId: string,
): Promise<CookPilotRecipeSummary[]> {
  const cached = summaryCache.get(userId);
  if (cached) return cached.summaries;
  const page = await fetchSummaryPage(userId, null);
  summaryCache.set(userId, {
    summaries: page.summaries,
    cursor: page.cursor,
    hasMore: page.hasMore,
    pending: null,
  });
  return page.summaries;
}

/** Fetches the next page and appends it to the cached list. No-ops past the end. */
export async function loadMoreCookPilotRecipeSummaries(
  userId: string,
): Promise<CookPilotRecipeSummary[]> {
  const cached = summaryCache.get(userId);
  if (!cached || !cached.hasMore) return cached?.summaries ?? [];
  if (cached.pending) return cached.pending;

  const pending = fetchSummaryPage(userId, cached.cursor).then((page) => {
    const current = summaryCache.get(userId) ?? cached;
    const merged = {
      summaries: [...current.summaries, ...page.summaries],
      cursor: page.cursor,
      hasMore: page.hasMore,
      pending: null,
    };
    summaryCache.set(userId, merged);
    return merged.summaries;
  });
  summaryCache.set(userId, { ...cached, pending });
  return pending;
}

/**
 * Loads every remaining page. Search needs to match against the whole
 * library, not just whatever's been scrolled into view so far, so typing
 * into the search box triggers this instead of the paginated loader above.
 */
export async function loadAllCookPilotRecipeSummaries(
  userId: string,
): Promise<CookPilotRecipeSummary[]> {
  await loadCookPilotRecipeSummaries(userId);
  while (hasMoreCookPilotSummaries(userId)) {
    await loadMoreCookPilotRecipeSummaries(userId);
  }
  return summaryCache.get(userId)?.summaries ?? [];
}

function searchTextFor(summary: CookPilotRecipeSummary): string {
  return [
    summary.title,
    summary.sourceURL,
    ...summary.tags,
    ...summary.systemTags,
    ...summary.ingredientNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterCookPilotSummaries(
  summaries: CookPilotRecipeSummary[],
  queryText: string,
): CookPilotRecipeSummary[] {
  const terms = queryText
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return summaries;
  return summaries.filter((summary) => {
    const haystack = searchTextFor(summary);
    return terms.every((term) => haystack.includes(term));
  });
}

function recipeFromStoredDocuments(
  summary: CookPilotRecipeSummary,
  detail: CookPilotRecipeDetail | null,
): Recipe | null {
  const recipeData: AnyRecord = {
    schemaVersion: detail?.schemaVersion ?? 2,
    title: summary.title,
    description: detail?.description ?? null,
    servings: summary.preferredServings ?? summary.servings,
    prepTime: detail?.prepTime ?? null,
    cookTime: detail?.cookTime ?? null,
    ingredientSections: detail?.ingredientSections ?? [],
    instructionSections: detail?.instructionSections ?? [],
    imageURL:
      detail?.imageURL ??
      detail?.imageUrl ??
      summary.imageURL ??
      null,
    image: detail?.image ?? detail?.images,
    tags: summary.tags,
    systemTags: summary.systemTags,
    nutrition: detail?.nutrition,
  };
  const recipe = adaptCookPilotRecipe(recipeData, summary.sourceURL);
  if (!recipe) return null;
  if (!recipe.totalTime && summary.totalTimeMinutes) {
    recipe.totalTime = `${summary.totalTimeMinutes} min`;
  }
  return recipe;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function loadCookPilotQueueItem(
  userId: string,
  summary: CookPilotRecipeSummary,
): Promise<QueueItem | null> {
  const detailSnapshot = await getDoc(recipeDetailRef(userId, summary.id));
  const detail = detailSnapshot.exists()
    ? (detailSnapshot.data() as CookPilotRecipeDetail)
    : null;
  const recipe = recipeFromStoredDocuments(summary, detail);
  if (!recipe) return null;

  return {
    id: cookPilotQueueId(summary.id),
    method: "cookpilot" as const,
    source: "CookPilot",
    status: "ready" as const,
    title: recipe.title || summary.title || "Untitled recipe",
    recipe,
    addedAt: Date.now(),
  } satisfies QueueItem;
}

export async function loadCookPilotQueueItems(
  userId: string,
  summaries: CookPilotRecipeSummary[],
): Promise<QueueItem[]> {
  const loaded = await mapWithConcurrency(
    summaries,
    DETAIL_LOAD_CONCURRENCY,
    (summary) => loadCookPilotQueueItem(userId, summary),
  );

  return loaded.filter((item): item is QueueItem => item !== null);
}
