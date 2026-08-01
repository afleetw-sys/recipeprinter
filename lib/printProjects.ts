"use client";

import type {
  CoverConfig,
  PrintProject,
  PrintProjectSettings,
  RecipePagePlacement,
  Section,
} from "@/types/recipe";
import { uid } from "@/lib/ids";

const PRINT_PROJECTS_COLLECTION = "printProjects";

// Firestore's setDoc rejects a document containing an explicit `undefined`
// anywhere (unlike JSON.stringify, which just drops it) — a saved project has
// several optional fields (title, cover, backCover, book-only settings), so
// this needs the same recursive strip lib/sharedRecipeCards.ts already uses
// for the same reason.
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

export function createPrintProjectId(): string {
  return uid();
}

/** Assembles a full `PrintProject` snapshot from the /print page's working
    state at the moment of saving — the one place the section/cover/title
    layer (lib/project.ts) and the device-local print-layout preferences
    (lib/printSettings.ts) actually get combined into the canonical document. */
export function assemblePrintProject(params: {
  id: string;
  ownerUid: string;
  title?: string;
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  settings: PrintProjectSettings;
  itemPlacements?: Record<string, RecipePagePlacement>;
  createdAt?: number;
}): PrintProject {
  const now = Date.now();
  return {
    id: params.id,
    ownerUid: params.ownerUid,
    title: params.title,
    sections: params.sections,
    cover: params.cover,
    backCover: params.backCover,
    settings: params.settings,
    itemPlacements: params.itemPlacements,
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  };
}

export async function savePrintProject(project: PrintProject): Promise<void> {
  if (!project.ownerUid) {
    throw new Error("Saving a project requires being signed in.");
  }
  const [{ doc, setDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const ref = doc(getDb(), "users", project.ownerUid, PRINT_PROJECTS_COLLECTION, project.id);
  await setDoc(ref, stripUndefined({ ...project, updatedAt: Date.now() }));
}

export async function loadPrintProjects(ownerUid: string): Promise<PrintProject[]> {
  const [{ collection, getDocs, orderBy, query }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snap = await getDocs(
    query(collection(getDb(), "users", ownerUid, PRINT_PROJECTS_COLLECTION), orderBy("updatedAt", "desc")),
  );
  return snap.docs.map((docSnap) => docSnap.data() as PrintProject);
}

export async function loadPrintProject(ownerUid: string, projectId: string): Promise<PrintProject | null> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snap = await getDoc(doc(getDb(), "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId));
  return snap.exists() ? (snap.data() as PrintProject) : null;
}

export async function deletePrintProject(ownerUid: string, projectId: string): Promise<void> {
  const [{ doc, deleteDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await deleteDoc(doc(getDb(), "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId));
}
