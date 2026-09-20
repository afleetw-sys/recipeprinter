import { fileProjectLocally } from "@/lib/localProjects";
import type { ProjectMeta } from "@/lib/project";
import type { QueueItem } from "@/types/recipe";

/**
 * Sets the open project aside so a NEW one can start from nothing.
 *
 * The recipe queue and the project identity are two separate stores, and
 * `startNewProject` only replaces the identity. Starting "new" without emptying
 * the queue therefore hands the fresh project every recipe the device was last
 * holding: a 70-recipe cookbook became a 70-card "new" recipe-cards project, and
 * once autosave ran, a second saved copy of the book.
 *
 * The working copy is filed to the on-device shelf first, in the same order the
 * front door uses when it releases a project (components/PrinterWorkspace), so
 * the previous book stays in the library under its own id. Returns whether the
 * queue was cleared. It is not when the shelf cannot be written to (private
 * mode, quota): the cook asked for a blank page, not for their book to be
 * deleted, and a slightly stale queue is the far better failure.
 *
 * A queue with nothing printable in it has nothing to file and nothing to lose,
 * so it is simply cleared.
 */
export function releaseWorkingProject(
  items: QueueItem[],
  meta: ProjectMeta,
  clear: () => void,
): boolean {
  const hasPrintable = items.some((item) => item.status === "ready" && item.recipe);
  if (hasPrintable && !fileProjectLocally(items, meta)) return false;
  if (items.length > 0) clear();
  return true;
}
