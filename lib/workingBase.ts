import { sessionStore } from "@/lib/storage";
import { BASE_SESSION_KEY, saveWorkingDraft } from "@/lib/workingDraft";

// ─────────────────────────────────────────────────────────────────────────────
// Which saved version the working copy was last in step with.
//
// The working copy is mirrored to the device on every edit (lib/queue,
// lib/project), so an edit made a moment before the tab closes is safe there.
// The account copy is a beat behind: autosave waits for edits to settle, and
// Chrome tears a closing tab down before that save can land. Reopening the book
// then loaded the account copy over the device one, and the edit was gone.
//
// Knowing the device copy is newer is not a matter of clocks. It is newer when
// it was edited FROM the version the account still holds: nobody has saved
// since, so it is that version plus edits. If the account has moved on (a save
// from another tab or device), the device copy is a stale branch and must not
// be written over it. This records that base: the project's id and the account
// revision the working copy was loaded as or last saved as.
//
// Kept beside the working copy on the same terms: per tab in sessionStorage,
// and on the device inside the same one snapshot as the recipes and the book
// (lib/workingDraft), so a reopened tab gets back the base that belongs to the
// very copy it recovers. Two tabs on one book can never pair one tab's stale
// edits with the other tab's newer revision.
//
// It also says whether the working copy has edits the account hasn't received.
// Only such a copy carries its base revision onto the device shelf, which is
// what lets Projects keep exactly those copies when it clears away the ones the
// account already holds (`pruneLocalProjects`), instead of every copy filed on
// the way out matching its saved revision and lingering.
//
// Deliberately NOT part of ProjectMeta: the autosave fingerprint is the whole
// meta, so a field every save updates would make every save look like an edit.
// ─────────────────────────────────────────────────────────────────────────────

const WORKING_BASE_KEY = BASE_SESSION_KEY;

interface WorkingBase {
  projectId: string;
  revision: number;
  /** The working copy has changed since `revision` was loaded or saved. */
  unsaved?: boolean;
}

function isWorkingBase(value: unknown): value is WorkingBase {
  const base = value as Partial<WorkingBase> | null;
  return Boolean(base) && typeof base!.projectId === "string" && Number.isFinite(base!.revision);
}

function writeWorkingBase(base: WorkingBase): void {
  sessionStore.setJson(WORKING_BASE_KEY, base);
  saveWorkingDraft();
}

/** The working copy is now in step with `revision` of `projectId` on the account. */
export function rememberWorkingBase(projectId: string, revision: number): void {
  writeWorkingBase({ projectId, revision });
}

/** The working copy has just changed. Written once per run of edits, not per
    keystroke: only the first change after a save changes anything. */
export function markWorkingCopyEdited(): void {
  const base = sessionStore.getJson<WorkingBase>(WORKING_BASE_KEY);
  if (!isWorkingBase(base) || base.unsaved) return;
  writeWorkingBase({ ...base, unsaved: true });
}

/** The working copy has no saved version behind it any more (a new project). */
export function forgetWorkingBase(): void {
  sessionStore.remove(WORKING_BASE_KEY);
  saveWorkingDraft();
}

/** The account revision this tab's working copy of `projectId` was edited
    from, while it holds edits the account hasn't received. Null when it has
    none, or the base belongs to another project. */
export function unsavedEditsBase(projectId: string | undefined): number | null {
  if (!projectId) return null;
  const base = sessionStore.getJson<WorkingBase>(WORKING_BASE_KEY);
  return isWorkingBase(base) && base.projectId === projectId && base.unsaved ? base.revision : null;
}
