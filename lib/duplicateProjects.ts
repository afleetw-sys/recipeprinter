import type { PrintProject } from "@/types/recipe";
import { deletePrintProject } from "@/lib/printProjects";
import {
  markCookbookProjectUnlockedLocal,
  persistCookbookProjectUnlock,
} from "@/lib/cookbookUnlocks";

/**
 * Silent repair for duplicate saved projects — one book that ended up stored
 * dozens of times over.
 *
 * These are the fallout of an autosave bug: landing on /print without a
 * ?project= parameter left the working copy unaware that it already had a saved
 * document, so the next autosave adopted it *again* under a freshly minted id.
 * Every such visit forked another copy of the same cookbook into the account.
 * The fork itself is fixed at the source (lib/anonymousProjectAdoption.ts adopts
 * in place, and /print reattaches to the saved document on load); this module
 * clears the copies people already accumulated.
 *
 * It runs on its own and says nothing. Nobody asked for thirty copies of their
 * cookbook and nobody should have to tidy them up, so there is no UI here — the
 * Projects page reconciles on load and renders the result.
 *
 * Because it deletes without asking, the rule for what counts as a stale fork
 * is deliberately strict (see `CONTAINMENT_THRESHOLD`). A copy holding recipes
 * of its own is left alone: an unswept duplicate is a blemish, and deleting
 * someone's only copy of a recipe is not.
 */

/** Share of an older copy's recipes that must also be in the copy being kept.
    A fork's ancestor is contained in it by construction — the book only grew
    between forks — so real forks sit at 1. The slack below 1 covers recipes
    dropped from the book after the fork; it is not enough to swallow a copy
    with meaningful content of its own, which is the point. */
const CONTAINMENT_THRESHOLD = 0.9;

function projectItemIds(project: PrintProject): Set<string> {
  return new Set(
    project.sections.flatMap((section) => section.items.map((item) => item.id)).filter(Boolean),
  );
}

function projectKind(project: PrintProject): string {
  return project.kind === "printProject" ? "printProject" : "cookbook";
}

/** Share of `older`'s recipes that `keeper` also holds, 0–1. Measured against
    the older copy on purpose: the question is whether anything would be lost by
    deleting it, not how similar the two books look. */
export function projectContainment(older: PrintProject, keeper: PrintProject): number {
  if (projectKind(older) !== projectKind(keeper)) return 0;
  const olderIds = projectItemIds(older);
  const keeperIds = projectItemIds(keeper);
  // An empty project has nothing that identifies it. Two of them are not
  // evidence of a fork, so they never pair up.
  if (olderIds.size === 0 || keeperIds.size === 0) return 0;
  let shared = 0;
  olderIds.forEach((id) => {
    if (keeperIds.has(id)) shared += 1;
  });
  return shared / olderIds.size;
}

export interface DuplicateGroup {
  /** The copy that survives — the most recently updated of the lineage. */
  keeper: PrintProject;
  /** Copies contained in the keeper, newest first. */
  duplicates: PrintProject[];
}

/** Sorts an account's projects into one group per book. Pure — the purchase
    question is handled by `reconcileDuplicateProjects`, which can act on it. */
export function groupDuplicateProjects(projects: PrintProject[]): DuplicateGroup[] {
  const byRecency = [...projects].sort(
    (a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0),
  );
  const groups: DuplicateGroup[] = [];

  for (const project of byRecency) {
    // Checked against every copy already kept, newest first: a lineage that
    // drifted across many forks is still contained in one of them.
    const group = groups.find(
      (candidate) => projectContainment(project, candidate.keeper) >= CONTAINMENT_THRESHOLD,
    );
    if (group) group.duplicates.push(project);
    else groups.push({ keeper: project, duplicates: [] });
  }

  return groups;
}

export interface DuplicateCleanupPlan {
  /** The projects to keep, newest first. */
  keep: PrintProject[];
  /** Stale forks, safe to delete. */
  remove: PrintProject[];
  /** Keepers that were handed the unlock of a copy being deleted, so a caller
      can show them as purchased without re-reading Firestore. */
  granted: string[];
}

/**
 * Works out what to delete, moving a purchase out of the way first.
 *
 * The tangle this has to handle: a cookbook's unlock hangs off its own project
 * id, and `reconcileCookbookProjectUnlocks` re-persisted that unlock at each
 * newly forked id without ever clearing the old one. So a book bought once can
 * have almost every one of its forks reading as "purchased" — pinning them all
 * would leave the whole pile on screen, which is how the first version of this
 * managed to delete nothing at all.
 *
 * The rule that actually holds: each surviving book keeps an unlock if any of
 * its copies had one. Where the keeper is already unlocked (usually — the
 * unlock followed the forks forward) the duplicates just go. Where it isn't,
 * the unlock is written onto the keeper first, and only a failure to write it
 * leaves a second copy standing.
 */
export async function planDuplicateCleanup(
  ownerUid: string,
  projects: PrintProject[],
  options: {
    /** Whether this copy carries a cookbook unlock. */
    isPurchased?: (project: PrintProject) => boolean;
    /** Puts an unlock on the keeper. Injected so this stays testable and so the
        unlock module isn't pulled into every caller. Returns false if the write
        was refused — after the rules lockdown, that is the expected answer. */
    grantUnlock?: (ownerUid: string, projectId: string) => Promise<boolean>;
  } = {},
): Promise<DuplicateCleanupPlan> {
  const isPurchased = options.isPurchased ?? (() => false);
  const keep: PrintProject[] = [];
  const remove: PrintProject[] = [];
  const granted: string[] = [];

  for (const { keeper, duplicates } of groupDuplicateProjects(projects)) {
    keep.push(keeper);
    if (duplicates.length === 0) continue;
    const purchasedCopies = duplicates.filter(isPurchased);
    if (purchasedCopies.length === 0 || isPurchased(keeper)) {
      remove.push(...duplicates);
      continue;
    }
    const unlockMoved = options.grantUnlock
      ? await options.grantUnlock(ownerUid, keeper.id).catch(() => false)
      : false;
    if (unlockMoved) {
      granted.push(keeper.id);
      remove.push(...duplicates);
      continue;
    }
    // The purchase could not be moved, so the copy holding it stays. Its own
    // duplicates still go: one unlocked copy is all the purchase needs.
    const [survivor] = purchasedCopies;
    keep.push(survivor);
    remove.push(...duplicates.filter((copy) => copy.id !== survivor.id));
  }

  return {
    keep: keep.sort(
      (a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0),
    ),
    remove,
    granted,
  };
}

/**
 * Moves a cookbook purchase onto the copy that is being kept. Server first —
 * the local map is only marked once the durable write lands, so a refused write
 * (the rules lockdown, or being offline) can't leave a device claiming an
 * unlock the account doesn't have.
 */
export async function grantCookbookUnlock(ownerUid: string, projectId: string): Promise<boolean> {
  try {
    await persistCookbookProjectUnlock(ownerUid, projectId);
    markCookbookProjectUnlockedLocal(projectId);
    return true;
  } catch (error) {
    console.warn("RecipePrinter: could not move a cookbook unlock", projectId, error);
    return false;
  }
}

/**
 * Deletes an account's stale forks in the background.
 *
 * Best-effort by design: a delete that fails is swallowed and simply retried
 * the next time the account's projects are loaded. A copy that failed to delete
 * is still left out of the caller's list — a cook seeing a stray duplicate
 * blink back is worse than one extra document sitting in Firestore for a while.
 */
export async function deleteDuplicateProjects(
  ownerUid: string,
  duplicates: PrintProject[],
): Promise<number> {
  const results = await Promise.all(
    duplicates.map((project) =>
      // `keepAssets` — a copy forked from an older one still serves its photos
      // out of that older copy's storage folder, so only the documents go.
      deletePrintProject(ownerUid, project.id, { keepAssets: true })
        .then(() => true)
        .catch((error) => {
          // Quiet for the cook, but not invisible to us: a rules change or an
          // offline tab would otherwise make the sweep look like it silently
          // did nothing on every visit.
          console.warn("RecipePrinter: could not remove a duplicate project", project.id, error);
          return false;
        }),
    ),
  );
  return results.filter(Boolean).length;
}
