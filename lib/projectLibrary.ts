import { isCookbookProjectUnlocked } from "@/lib/cookbookUnlocks";
import { groupDuplicateProjects } from "@/lib/duplicateProjects";
import { listableLocalProjects } from "@/lib/localProjects";
import type { PrintProjectSummary } from "@/types/recipe";

/**
 * What is in this cook's library, as every surface that shows it should agree.
 *
 * `/projects` and the header's account dropdown each used to compose their
 * own answer out of the same three helpers, and disagreed, in the one
 * direction that costs money — signed in, the dropdown listed ONLY the
 * account's projects and never merged the device shelf, so a cookbook bought
 * while signed out (its unlock recorded locally against the local project id,
 * until the webhook lands or the book is adopted) appeared on `/projects` and
 * was missing from the menu. The dropdown no longer carries a projects list
 * of its own at all — it just links to `/projects` now — but the rule stays
 * here, in one place, so the same mistake can't happen again the moment a
 * second caller shows up (the dropdown's own "a cookbook is saved on this
 * device" check is exactly that second caller today).
 *
 * The three rules, in one place:
 *
 * 1. Stale forks left by an old autosave bug are hidden, never listed. The
 *    DELETION still belongs to `/projects`, which knows which copies are
 *    purchased; this only decides what is shown.
 * 2. The device shelf is a safety net, not a list of your saved work, so the
 *    only local-only thing that surfaces is a cookbook that has been PAID FOR.
 *    See `listableLocalProjects` for why that exception is not a half-measure.
 * 3. Newest first.
 *
 * `isPaidCookbook` is injected for the same reason `listableLocalProjects`
 * takes it: the real one reads a localStorage map, and a test about which
 * projects are LISTED should not have to stand that up.
 */
export function libraryProjects({
  accountProjects,
  localProjects,
  isPaidCookbook = isCookbookProjectUnlocked,
}: {
  accountProjects: readonly PrintProjectSummary[];
  /** Signed out this is the whole library; signed in it is checked against the
      account so a book held in both places is listed once. */
  localProjects: readonly PrintProjectSummary[];
  isPaidCookbook?: (projectId: string) => boolean;
}): PrintProjectSummary[] {
  const keepers = groupDuplicateProjects([...accountProjects]).map((group) => group.keeper);
  // Every account id, not just the keepers': a device copy of a book the
  // account holds is redundant whichever fork of it the account is showing.
  const accountIds = new Set(accountProjects.map((project) => project.id));
  return [...keepers, ...listableLocalProjects(localProjects, accountIds, isPaidCookbook)].sort(
    (a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0),
  );
}

/**
 * What to call a library entry on screen when it has no title of its own.
 *
 * A saved project normally carries one (see `projectDisplayTitle` and the save
 * path in the workspace), so this is the floor rather than the rule. It lived
 * as the same ternary three times on `/projects` — the card's label, its title,
 * and the delete confirmation — and a fourth copy is how one of them ends up
 * saying something different from the others.
 */
export function projectListTitle(project: Pick<PrintProjectSummary, "title" | "kind">): string {
  return project.title || (project.kind === "printProject" ? "Untitled recipe cards" : "Untitled cookbook");
}
