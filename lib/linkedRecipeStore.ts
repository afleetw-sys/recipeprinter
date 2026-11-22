import type { QueueItem, Recipe, RecipeLink } from "@/types/recipe";
import {
  recipePrinterLinkedRecipePath,
  recipePrinterLinkedRecipesPath,
} from "@/lib/firebase/recipePrinterPaths";
import { stripUndefined } from "@/lib/firebase/stripUndefined";
import {
  fieldPrints,
  linkAt,
  mergeLinked,
  storedRecipe,
  type FieldConflict,
  type FieldPrints,
  type LinkedMerge,
} from "@/lib/linkedRecipes";

/**
 * The shared record behind a linked recipe, one per recipe per account, at
 * `products/recipePrinter/users/{uid}/linkedRecipes/{id}`.
 *
 * It exists only once a recipe is in use in a second place, so the books and
 * card jobs nobody links cost nothing and need no migration. Projects keep
 * their own copies; this is what those copies agree through. Nothing here is
 * about purchases: what a project may print is decided by the project, never
 * by the recipe (see `computeProLocks`), so a record carries recipe content and
 * bookkeeping and nothing else.
 *
 * Saved projects are listed as members, so a project opened later can find the
 * recipes it shares (`projectIds`, queried with array-contains) and which of its
 * items each one is (`members`). A card job printed from a book and never saved
 * is not a member: it reaches its records through its items' links.
 */
export interface LinkedRecipeRecord {
  recipe: Recipe;
  rev: number;
  updatedAt: number;
  projectIds: string[];
  /** projectId → that project's item id for this recipe. */
  members: Record<string, string>;
  /** The version a member listed before it ever opened with a link (the book
      a recipe was first shared out of) is taken to have agreed with. */
  origin: { rev: number; base: FieldPrints };
}

async function firestore() {
  const [fs, { getDb }] = await Promise.all([import("firebase/firestore"), import("@/lib/firebase/db")]);
  return { fs, db: getDb() };
}

function asRecord(data: unknown): LinkedRecipeRecord | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Partial<LinkedRecipeRecord>;
  if (!record.recipe || typeof record.rev !== "number") return null;
  return {
    recipe: record.recipe,
    rev: record.rev,
    updatedAt: Number(record.updatedAt ?? 0),
    projectIds: Array.isArray(record.projectIds) ? record.projectIds : [],
    members: record.members && typeof record.members === "object" ? record.members : {},
    origin: record.origin ?? { rev: 1, base: fieldPrints(record.recipe) },
  };
}

/** The record id for a recipe first shared out of `projectId`'s item `itemId`.
    Deterministic, so sharing the same recipe twice (two taps, two tabs) lands
    on one record instead of two. */
export function linkedRecipeId(projectId: string, itemId: string): string {
  return `${projectId}_${itemId}`.replace(/\//g, "_");
}

export interface ShareSource {
  /** The project the recipe is being shared out of. */
  projectId: string;
  /** Whether that project is saved to the account, and so a member. */
  member: boolean;
  itemId: string;
  /** The copy as that project holds it now. */
  recipe: Recipe;
  /** What it shares out (see `recipeToShare`): the same recipe with the book's
      photo choice moved into it. */
  shared: Recipe;
  link?: RecipeLink;
}

/**
 * The record a new copy should join, created if this is the recipe's first
 * share. Answers the recipe the copy should hold and its link.
 */
export async function shareRecipe(uid: string, source: ShareSource): Promise<{ recipe: Recipe; link: RecipeLink }> {
  const { fs, db } = await firestore();
  if (source.link) {
    const snap = await fs.getDocFromServer(fs.doc(db, ...recipePrinterLinkedRecipePath(uid, source.link.id)));
    const existing = snap.exists() ? asRecord(snap.data()) : null;
    if (existing) return { recipe: existing.recipe, link: linkAt(source.link.id, existing.rev, existing.recipe) };
  }
  const id = linkedRecipeId(source.projectId, source.itemId);
  const ref = fs.doc(db, ...recipePrinterLinkedRecipePath(uid, id));
  return fs.runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? asRecord(snap.data()) : null;
    if (existing) return { recipe: existing.recipe, link: linkAt(id, existing.rev, existing.recipe) };
    const recipe = storedRecipe(source.shared);
    const record: LinkedRecipeRecord = {
      recipe,
      rev: 1,
      updatedAt: Date.now(),
      projectIds: source.member ? [source.projectId] : [],
      members: source.member ? { [source.projectId]: source.itemId } : {},
      origin: { rev: 1, base: fieldPrints(storedRecipe(source.recipe)) },
    };
    transaction.set(ref, stripUndefined(record));
    return { recipe, link: linkAt(id, 1, recipe) };
  });
}

export interface LinkedUpdate {
  itemId: string;
  /** Fields to take from the record (`undefined` = remove the field). */
  fromRemote: LinkedMerge["fromRemote"];
  /** The copy's new link, or null when its record is gone and it no longer
      shares anything (it keeps its content). */
  link: RecipeLink | null;
}

export interface ReconcileResult {
  updates: LinkedUpdate[];
  conflicts: Array<{ itemId: string; conflicts: FieldConflict[] }>;
  /** Items whose own edits were written to their record. */
  pushed: string[];
  /** For each linked item, the OTHER saved projects using it. */
  sharedWith: Record<string, string[]>;
}

/**
 * Brings a project's linked copies and their records into step: edits made
 * here are written out, edits made elsewhere come in, and the project's
 * membership is kept true. `projectId` is the project's id when it is saved to
 * the account (and so a member), null for a card job nobody has kept.
 *
 * Reads outside a transaction to find what has to change, then re-reads and
 * writes only those records inside one, so a big book that changed one recipe
 * writes one document.
 */
export async function reconcileLinkedRecipes(
  uid: string,
  projectId: string | null,
  items: readonly QueueItem[],
): Promise<ReconcileResult> {
  const { fs, db } = await firestore();
  const recordRef = (id: string) => fs.doc(db, ...recipePrinterLinkedRecipePath(uid, id));
  const result: ReconcileResult = { updates: [], conflicts: [], pushed: [], sharedWith: {} };

  const records = new Map<string, LinkedRecipeRecord>();
  const claimed = new Set<string>();
  if (projectId) {
    const snap = await fs.getDocsFromServer(
      fs.query(
        fs.collection(db, ...recipePrinterLinkedRecipesPath(uid)),
        fs.where("projectIds", "array-contains", projectId),
      ),
    );
    for (const docSnap of snap.docs) {
      const record = asRecord(docSnap.data());
      if (!record) continue;
      records.set(docSnap.id, record);
      claimed.add(docSnap.id);
    }
  }

  // Every linked copy, including one this project has not opened since its
  // recipe was shared out of it (it is listed as a member but carries no link
  // yet: it agreed with the record's first version).
  const linked: Array<{ item: QueueItem & { recipe: Recipe }; link: RecipeLink; adopted: boolean }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.recipe || !item.link || seen.has(item.link.id)) continue;
    seen.add(item.link.id);
    linked.push({ item: item as QueueItem & { recipe: Recipe }, link: item.link, adopted: false });
  }
  const stale: string[] = [];
  for (const id of Array.from(claimed)) {
    const record = records.get(id)!;
    const memberId = record.members[projectId!];
    if (seen.has(id)) continue;
    const item = items.find((candidate) => candidate.id === memberId);
    if (item?.recipe && !item.link) {
      seen.add(id);
      linked.push({
        item: item as QueueItem & { recipe: Recipe },
        link: { id, rev: record.origin.rev, base: record.origin.base },
        adopted: true,
      });
    } else {
      // Removed from this project (or now linked to something else): this
      // project stops being a member, and nothing else is touched.
      stale.push(id);
    }
  }

  const unread = linked.filter(({ link }) => !records.has(link.id));
  const fetched = await Promise.all(unread.map(({ link }) => fs.getDocFromServer(recordRef(link.id))));
  fetched.forEach((snap, index) => {
    const record = snap.exists() ? asRecord(snap.data()) : null;
    if (record) records.set(unread[index]!.link.id, record);
  });

  const needsMembership = (record: LinkedRecipeRecord, itemId: string) =>
    Boolean(projectId) && (record.members[projectId!] !== itemId || !record.projectIds.includes(projectId!));

  const toWrite: typeof linked = [];
  for (const entry of linked) {
    const record = records.get(entry.link.id);
    if (!record) {
      // Its record is gone: every other place let it go. The copy keeps its
      // recipe and simply stops sharing it.
      result.updates.push({ itemId: entry.item.id, fromRemote: {}, link: null });
      continue;
    }
    const merge = mergeLinked(entry.item.recipe, entry.link.base, record.recipe);
    if (merge.pushes || needsMembership(record, entry.item.id)) {
      toWrite.push(entry);
      continue;
    }
    result.sharedWith[entry.item.id] = record.projectIds.filter((id) => id !== projectId);
    if (entry.adopted || Object.keys(merge.fromRemote).length > 0 || entry.link.rev !== record.rev) {
      result.updates.push({
        itemId: entry.item.id,
        fromRemote: merge.fromRemote,
        link: linkAt(entry.link.id, record.rev, merge.recipe),
      });
    }
  }

  if (toWrite.length === 0 && stale.length === 0) return result;

  const written = await fs.runTransaction(db, async (transaction) => {
    const out: Pick<ReconcileResult, "updates" | "conflicts" | "pushed" | "sharedWith"> = {
      updates: [],
      conflicts: [],
      pushed: [],
      sharedWith: {},
    };
    const fresh = await Promise.all(toWrite.map(({ link }) => transaction.get(recordRef(link.id))));
    const freshStale = await Promise.all(stale.map((id) => transaction.get(recordRef(id))));
    const now = Date.now();
    toWrite.forEach((entry, index) => {
      const snap = fresh[index]!;
      const record = snap.exists() ? asRecord(snap.data()) : null;
      if (!record) {
        out.updates.push({ itemId: entry.item.id, fromRemote: {}, link: null });
        return;
      }
      const merge = mergeLinked(entry.item.recipe, entry.link.base, record.recipe);
      const rev = merge.pushes ? record.rev + 1 : record.rev;
      const projectIds = projectId && !record.projectIds.includes(projectId)
        ? [...record.projectIds, projectId]
        : record.projectIds;
      const members = projectId ? { ...record.members, [projectId]: entry.item.id } : record.members;
      const recipe = storedRecipe(merge.recipe);
      transaction.set(
        recordRef(entry.link.id),
        stripUndefined({ ...record, recipe, rev, updatedAt: now, projectIds, members }),
      );
      out.updates.push({ itemId: entry.item.id, fromRemote: merge.fromRemote, link: linkAt(entry.link.id, rev, recipe) });
      if (merge.conflicts.length > 0) out.conflicts.push({ itemId: entry.item.id, conflicts: merge.conflicts });
      if (merge.pushes) out.pushed.push(entry.item.id);
      out.sharedWith[entry.item.id] = projectIds.filter((id) => id !== projectId);
    });
    stale.forEach((id, index) => {
      const snap = freshStale[index]!;
      const record = snap.exists() ? asRecord(snap.data()) : null;
      if (!record || !projectId) return;
      const projectIds = record.projectIds.filter((member) => member !== projectId);
      const members = { ...record.members };
      delete members[projectId];
      // The last project using it let it go. A card job still holding a link to
      // it just stops sharing (see the `!record` branches above).
      if (projectIds.length === 0) transaction.delete(recordRef(id));
      else transaction.set(recordRef(id), stripUndefined({ ...record, projectIds, members }));
    });
    return out;
  });

  result.updates.push(...written.updates);
  result.conflicts.push(...written.conflicts);
  result.pushed.push(...written.pushed);
  Object.assign(result.sharedWith, written.sharedWith);
  return result;
}

/**
 * A deleted project stops being a member of everything it shared. Records it
 * was the last member of go too. No other project's copy is touched: removing
 * a recipe from one place never removes it from another.
 */
export async function leaveLinkedRecipes(uid: string, projectId: string): Promise<void> {
  await reconcileLinkedRecipes(uid, projectId, []);
}

/** Every photo a linked recipe record holds, so deleting a project never
    deletes a photo another project is about to take from its record. */
export async function linkedRecipePhotoUrls(uid: string): Promise<string[]> {
  const { fs, db } = await firestore();
  const snap = await fs.getDocsFromServer(fs.collection(db, ...recipePrinterLinkedRecipesPath(uid)));
  return snap.docs
    .map((docSnap) => asRecord(docSnap.data())?.recipe.image)
    .filter((url): url is string => Boolean(url));
}
