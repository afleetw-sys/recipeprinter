import { isCookbookProjectUnlocked } from "@/lib/cookbookUnlocks";
import { groupDuplicateProjects } from "@/lib/duplicateProjects";
import { listableLocalProjects } from "@/lib/localProjects";
import type { PrintProjectSummary } from "@/types/recipe";

/**
 * What is in this cook's library, as every surface that shows it should agree.
 *
 * Two surfaces show it — `/projects` and the account dropdown — and they each
 * composed their own answer out of the same three helpers. They disagreed, in
 * the one direction that costs money: signed in, the dropdown listed ONLY the
 * account's projects and never merged the device shelf, so a cookbook bought
 * while signed out (its unlock recorded locally against the local project id,
 * until the webhook lands or the book is adopted) appeared on `/projects` and
 * was missing from the menu. Both files' comments say that is the one thing
 * that must never be hidden.
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
