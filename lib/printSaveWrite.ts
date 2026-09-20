import type { AccountSaveStatus } from "@/components/AccountControl";
import type { adoptAnonymousProject } from "@/lib/anonymousProjectAdoption";
import type { savePrintProject } from "@/lib/printProjects";
import type { materializeProjectPhotos, MaterializedPhotos } from "@/lib/photoStorage";
import type { ProjectMeta } from "@/lib/project";
import { printProjectFingerprint, SAVE_TIMEOUT_MS, type PendingSave } from "@/lib/printSave";
import type { PrintProject } from "@/types/recipe";

/*
 * The write half of the save path, lifted out of app/print/page.tsx with no
 * change in behavior. It is the part that decides what "a save is happening"
 * means: the in-flight latch, the generation that tells a live write from one
 * that was given up on, the one-deep queue, the deadline, and what each outcome
 * reports. It has no React in it, which is what lets it be tested with fake
 * timers and fake I/O.
 *
 * The refs are the page's own `useRef` objects, passed in rather than owned
 * here, on purpose: the page also reads and writes them from the account-reset
 * effect, the loader, conflict recovery and the autosave loop, and moving them
 * would have meant touching every one of those. Anything with a `.current` works.
 *
 * The context is captured at the moment a write STARTS, and a queued write is
 * replayed with the same one. That matches what the page did before this moved:
 * `writeProject` closed over the render it began in, and its replay called that
 * same closure. If the context ever needs to be fresher than that, it is a
 * behavior change and belongs in its own commit.
 */

/** Anything with a `.current`: a React ref, or a plain object in a test. */
export interface SaveRef<T> {
  current: T;
}

export interface SaveWriteRefs {
  saveInFlight: SaveRef<boolean>;
  saveGeneration: SaveRef<number>;
  queuedSave: SaveRef<PendingSave | null>;
  projectRevision: SaveRef<number>;
  savedProjectId: SaveRef<string | null>;
  lastSavedCookbookMode: SaveRef<boolean>;
  lastSavedFingerprint: SaveRef<string | null>;
  quietFirstSave: SaveRef<boolean>;
}

export interface SaveWriteContext {
  refs: SaveWriteRefs;
  materializePhotos: typeof materializeProjectPhotos;
  saveProject: typeof savePrintProject;
  adoptProject: typeof adoptAnonymousProject;
  /** Whether an error is the "someone else saved first" conflict. */
  isConflictError: (error: unknown) => boolean;
  /** Whether the last adoption attempt recorded itself as failed. */
  adoptionFailed: () => boolean;
  setSaveStatus: (status: AccountSaveStatus) => void;
  setSavedProjectId: (id: string) => void;
  /** A confirmation, not a failure: must put the toast back to its informational
      tone, or it would show red right after an error toast. */
  showToast: (message: string) => void;
  adoptUploadedPhotos: (uploaded: MaterializedPhotos["uploadedRecipeImages"]) => void;
  /** The working copy's own project id, read when the write lands. A getter so
      it is evaluated at the same moment it always was, after the await. */
  metaProjectId: () => ProjectMeta["projectId"];
  setMetaProjectId: (id: string) => void;
}

/** Said once, at the first save of a card job that nobody pressed Save for. */
export const FIRST_SAVE_TOAST = "Saved to Projects. This project will keep saving automatically.";

/**
 * Writes one assembled document, and is the only place that says a save is
 * happening — so the two can never disagree.
 */
export async function writeProject(pending: PendingSave, ctx: SaveWriteContext): Promise<void> {
  const { refs } = ctx;
  // The account this document was assembled FOR, not whoever is signed in by
  // the time it gets written. A save that waited its turn while somebody
  // signed out and back in as someone else must still go to the account it
  // was built for — `savePrintProject` already writes under the document's
  // own `ownerUid`, and adoption takes the uid it is handed, so handing it
  // the live one is how one person's book reaches another person's library.
  const ownerUid = pending.project.ownerUid;
  if (!ownerUid) return;
  const generation = refs.saveGeneration.current + 1;
  refs.saveGeneration.current = generation;
  /** Whether this write is still the one the page is waiting on. A write that
      was given up on, or overtaken, reports nothing: its news is old. */
  const current = () => refs.saveGeneration.current === generation;
  refs.saveInFlight.current = true;
  ctx.setSaveStatus("saving");
  // Releases the latch exactly once, whichever of the write and the deadline
  // gets there first, and starts whatever was queued behind it.
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    refs.saveInFlight.current = false;
    const queued = refs.queuedSave.current;
    if (queued) {
      refs.queuedSave.current = null;
      setTimeout(() => void writeProject(queued, ctx), 0);
    }
  };
  const deadline = setTimeout(() => {
    if (!current()) return;
    // Stop claiming, and stop blocking. The write is NOT cancelled and the
    // generation is NOT bumped — "we gave up waiting" is not "it did not
    // happen", so if this write does land it is still the current one and still gets
    // to report itself, revision and all. What ends here is the spinner and
    // the latch: the cook gets a failure they can retry, and the next save is
    // free to run instead of queueing behind a promise that never answers.
    //
    // `lastSavedFingerprint` is deliberately untouched, so nothing is
    // recorded as saved on the strength of a write we did not see finish.
    console.warn("RecipePrinter: a save is taking too long; no longer waiting on it");
    ctx.setSaveStatus("error");
    release();
  }, SAVE_TIMEOUT_MS);
  try {
    // Every field that can hold a photo, not just the ones that were easy to
    // remember. A chapter collage defaults to its own recipes' images and a
    // recipe's photo history holds the ones it has worn before, so on a
    // Paprika book both were full of `blob:` URLs going straight into the
    // document. See `materializeProjectPhotos`.
    const { photos, uploadedRecipeImages } = await ctx.materializePhotos({
      sections: pending.project.sections,
      cover: pending.project.cover,
      backCover: pending.project.backCover,
      dedication: pending.project.dedication,
      itemPlacements: pending.project.itemPlacements,
      stashedCookbook: pending.project.stashedCookbook,
    });
    const project: PrintProject = { ...pending.project, ...photos };
    // Read before this write can set it — this is the one signal for
    // "is this THE first save" (see the toast below), and by the next
    // line it's already gone true for good.
    const isFirstSave = !refs.savedProjectId.current;
    const saved = refs.savedProjectId.current
      ? await ctx.saveProject(project)
      : await ctx.adoptProject(ownerUid, project, {
          overwriteExisting: pending.overwriteApproved,
        });
    // Everything below describes THIS write, so a write that has been
    // overtaken says none of it: its revision is behind the one that
    // overtook it, and adopting it here would send the next save into a
    // conflict over a document nothing is actually fighting for.
    if (!current()) return;
    refs.projectRevision.current = Number(saved.revision ?? 0);
    refs.savedProjectId.current = saved.id;
    ctx.setSavedProjectId(saved.id);
    // This write just made THIS mode the last-agreed one — see
    // `lastSavedCookbookModeRef`'s own comment.
    refs.lastSavedCookbookMode.current = Boolean(project.settings.cookbookMode);
    /**
     * The photos are in Storage now, so stop treating the browser's copy as
     * the source.
     *
     * Only after the save has actually landed — the queue must not start
     * claiming a URL for a document that was never written. Before this the
     * working copy kept its `blob:` URLs forever, so every subsequent save
     * fetched, re-encoded and re-uploaded the same photos and orphaned the
     * previous objects. On a four-hundred-photo Paprika library that was the
     * whole library, per edit.
     *
     * Costs one extra autosave: the queue changing is a content change, and
     * the next pass finds nothing left to upload and settles. The content
     * document itself is not rewritten for it — the signature is unchanged,
     * so `savePrintProject` skips that half.
     */
    ctx.adoptUploadedPhotos(uploadedRecipeImages);
    if (saved.id !== ctx.metaProjectId()) {
      ctx.setMetaProjectId(saved.id);
    }
    // The baseline describes the book that was WRITTEN, taken from the
    // workspace this document was assembled from. Reading live state here
    // instead meant a save that landed after an edit recorded the edit as
    // saved too, and nothing ever went back for it.
    refs.lastSavedFingerprint.current = printProjectFingerprint(
      pending.items,
      { ...pending.meta, projectId: saved.id },
      pending.layout,
    );
    ctx.setSaveStatus("saved");
    // Said once, at the one moment it's true. A card job becomes a project
    // when its second recipe arrives, with nobody pressing anything, so this
    // is the only place a cook learns it happened and that it will keep
    // going. After it the header carries a quiet "Saved" (see
    // `renderSaveControl`); it is not announced again.
    if (isFirstSave && !refs.quietFirstSave.current) {
      ctx.showToast(FIRST_SAVE_TOAST);
    }
    refs.quietFirstSave.current = false;
  } catch (error) {
    console.warn("RecipePrinter: could not save project", error);
    if (!current()) return;
    if (ctx.isConflictError(error)) {
      ctx.setSaveStatus("conflict");
    } else {
      ctx.setSaveStatus(ctx.adoptionFailed() ? "adoption" : "error");
    }
  } finally {
    clearTimeout(deadline);
    release();
  }
}
