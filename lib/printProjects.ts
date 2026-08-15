"use client";

import type {
  CoverConfig,
  PrintProject,
  PrintProjectSettings,
  RecipePagePlacement,
  Section,
} from "@/types/recipe";
import { uid } from "@/lib/ids";
import {
  recipePrinterProjectPath,
  recipePrinterProjectsPath,
  recipePrinterUserPhotoRoot,
} from "@/lib/firebase/recipePrinterPaths";

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
  dedication?: CoverConfig;
  frontMatter?: import("@/types/recipe").CookbookFrontMatter;
  settings: PrintProjectSettings;
  itemPlacements?: Record<string, RecipePagePlacement>;
  createdAt?: number;
  revision?: number;
  kind?: "cookbook" | "printProject";
}): PrintProject {
  const now = Date.now();
  return {
    id: params.id,
    kind: params.kind ?? (params.settings.cookbookMode ? "cookbook" : "printProject"),
    revision: params.revision ?? 0,
    ownerUid: params.ownerUid,
    title: params.title,
    sections: params.sections,
    cover: params.cover,
    backCover: params.backCover,
    dedication: params.dedication,
    frontMatter: params.frontMatter,
    settings: params.settings,
    itemPlacements: params.itemPlacements,
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  };
}

export class PrintProjectConflictError extends Error {
  constructor() {
    super("This project was updated somewhere else.");
    this.name = "PrintProjectConflictError";
  }
}

export async function savePrintProject(project: PrintProject): Promise<PrintProject> {
  if (!project.ownerUid) {
    throw new Error("Saving a project requires being signed in.");
  }
  const [{ doc, runTransaction }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const ref = doc(db, ...recipePrinterProjectPath(project.ownerUid, project.id));
  const saved = await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    const remoteRevision = existing.exists()
      ? Number((existing.data() as Partial<PrintProject>).revision ?? 0)
      : 0;
    const expectedRevision = Number(project.revision ?? 0);
    if (existing.exists() && remoteRevision !== expectedRevision) {
      throw new PrintProjectConflictError();
    }
    const next = stripUndefined({
      ...project,
      revision: remoteRevision + 1,
      createdAt: existing.exists()
        ? Number((existing.data() as Partial<PrintProject>).createdAt ?? project.createdAt)
        : project.createdAt,
      updatedAt: Date.now(),
    }) as PrintProject;
    transaction.set(ref, next);
    return next;
  });
  return saved;
}

export async function loadPrintProjects(ownerUid: string): Promise<PrintProject[]> {
  const [{ collection, getDocs, orderBy, query }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const [namespaced, legacy] = await Promise.all([
    getDocs(query(collection(db, ...recipePrinterProjectsPath(ownerUid)), orderBy("updatedAt", "desc")))
      .catch(() => null),
    // Fault-isolated like the namespaced read: a transient error / rules change
    // on the legacy collection must not reject the whole load and make every
    // saved project appear to vanish — merge whichever half succeeded.
    getDocs(query(collection(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION), orderBy("updatedAt", "desc")))
      .catch(() => null),
  ]);
  const byId = new Map<string, PrintProject>();
  legacy?.docs.forEach((snap) => byId.set(snap.id, snap.data() as PrintProject));
  namespaced?.docs.forEach((snap) => byId.set(snap.id, snap.data() as PrintProject));
  return Array.from(byId.values()).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
}

export async function loadPrintProject(ownerUid: string, projectId: string): Promise<PrintProject | null> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const snap = await getDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId))).catch(() => null);
  if (snap?.exists()) return snap.data() as PrintProject;
  // Temporary compatibility read. New writes are namespace-only.
  const legacy = await getDoc(doc(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId));
  return legacy.exists() ? (legacy.data() as PrintProject) : null;
}

export async function deletePrintProject(
  ownerUid: string,
  projectId: string,
  // Duplicate cleanup passes `keepAssets`. A forked copy only rewrites the
  // *anonymous* photo URLs it adopts, so books that were forked from an earlier
  // copy still point at that copy's `adopted/<id>/` folder — sweeping it while
  // deleting the older document would blank out the book being kept. Orphaned
  // photo objects are cheap; broken images in a kept cookbook are not.
  options: { keepAssets?: boolean } = {},
): Promise<void> {
  const [{ doc, deleteDoc }, { getDb }, { deleteObject, listAll, ref }, { getFirebaseStorage }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
    import("firebase/storage"),
    import("@/lib/firebase/storage"),
  ]);
  const db = getDb();
  const adoptedRoot = ref(
    getFirebaseStorage(),
    `${recipePrinterUserPhotoRoot(ownerUid)}/adopted/${projectId}`,
  );
  // Adopted anonymous images are copied under a project-owned prefix, so this
  // folder is safe to remove. User-wide uploads are intentionally retained:
  // another project or the recipe queue may still reference them.
  const removeFolder = async (folder: ReturnType<typeof ref>): Promise<void> => {
    const listed = await listAll(folder);
    await Promise.all([
      ...listed.items.map((item) => deleteObject(item)),
      ...listed.prefixes.map((prefix) => removeFolder(prefix)),
    ]);
  };
  if (!options.keepAssets) await removeFolder(adoptedRoot);
  // Compatibility reads merge the namespaced and legacy collections. Remove
  // both copies so an older project cannot reappear after deletion.
  await Promise.all([
    deleteDoc(doc(db, ...recipePrinterProjectPath(ownerUid, projectId))),
    deleteDoc(doc(db, "users", ownerUid, PRINT_PROJECTS_COLLECTION, projectId)),
  ]);
}
