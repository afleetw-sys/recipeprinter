import type { PrintProject } from "@/types/recipe";
import { deletePrintProject } from "@/lib/printProjects";

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

export interface DuplicateCleanupPlan {
  /** The projects to keep, newest first. */
  keep: PrintProject[];
  /** Stale forks, safe to delete. */
  remove: PrintProject[];
}

export function planDuplicateCleanup(
  projects: PrintProject[],
  options: {
    /** Copies that must survive whatever their content. The Projects page pins
        purchased cookbooks (a cookbook's unlock hangs off its own project id)
        and the project the cook is working in right now. */
    pin?: (project: PrintProject) => boolean;
  } = {},
): DuplicateCleanupPlan {
  const byRecency = [...projects].sort(
    (a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0),
  );
  const keep: PrintProject[] = [];
  const remove: PrintProject[] = [];

  for (const project of byRecency) {
    if (options.pin?.(project)) {
      keep.push(project);
      continue;
    }
    // Checked against every copy already kept, newest first: a lineage that
    // drifted across many forks is still contained in one of them.
    const containedIn = keep.some(
      (keeper) => projectContainment(project, keeper) >= CONTAINMENT_THRESHOLD,
    );
    if (containedIn) remove.push(project);
    else keep.push(project);
  }

  return { keep, remove };
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
        .catch(() => false),
    ),
  );
  return results.filter(Boolean).length;
}
