"use client";

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/db";
import { adaptCookPilotRecipe } from "@/lib/cookpilot";
import type { QueueItem, Recipe } from "@/types/recipe";

type AnyRecord = Record<string, unknown>;

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
  return collection(db, "users", userId, "recipes");
}

function recipeDetailRef(userId: string, recipeId: string) {
  return doc(db, "users", userId, "recipes", recipeId, "detail", "main");
}

export function cookPilotQueueId(recipeId: string): string {
  return `cookpilot:${recipeId}`;
}

export async function loadCookPilotRecipeSummaries(
  userId: string,
): Promise<CookPilotRecipeSummary[]> {
  const snapshot = await getDocs(query(recipesCollection(userId), orderBy("createdAt", "desc")));
  return snapshot.docs.map(decodeSummary);
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
    imageURL: summary.imageURL ?? null,
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

export async function loadCookPilotQueueItems(
  userId: string,
  summaries: CookPilotRecipeSummary[],
): Promise<QueueItem[]> {
  const loaded: Array<QueueItem | null> = await Promise.all(
    summaries.map(async (summary) => {
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
        selected: true,
        addedAt: Date.now(),
      } satisfies QueueItem;
    }),
  );

  return loaded.filter((item): item is QueueItem => item !== null);
}
