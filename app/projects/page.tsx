"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, IconButton } from "@/components/Controls";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { BookIcon, CheckIcon, ICON_SIZE, SpinnerIcon, TrashIcon } from "@/components/icons";
import { deletePrintProject, loadPrintProjects } from "@/lib/printProjects";
import { loadCookbookProjectUnlock, reconcileCookbookProjectUnlocks } from "@/lib/cookbookUnlocks";
import { photoGridLayout } from "@/lib/photoGrid";
import type { PrintProject } from "@/types/recipe";

function projectDate(project: PrintProject): string {
  const timestamp = Number(project.updatedAt || project.createdAt);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp)
    : "Date unavailable";
}

function recipeCount(project: PrintProject): number {
  return project.sections.reduce((count, section) => count + section.items.length, 0);
}

/** The recipe photos in a project, deduped and in book order. */
function projectImages(project: PrintProject): string[] {
  const urls = project.sections.flatMap((section) =>
    section.items.map((item) => item.recipe?.image),
  );
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
}

function ProjectCover({ project }: { project: PrintProject }) {
  const images = projectImages(project).slice(0, 4);
  if (images.length === 0) {
    return (
      <div className="project-cover project-cover--empty" aria-hidden>
        <BookIcon size={28} />
      </div>
    );
  }
  const { columns, firstSpans } = photoGridLayout(images.length);
  return (
    <div
      className="project-cover"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      aria-hidden
    >
      {images.map((url, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url}-${index}`}
          src={url}
          alt=""
          className={firstSpans && index === 0 ? "project-cover__img--wide" : undefined}
        />
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const { user, ready } = useCookPilotAuth();
  const [projects, setProjects] = useState<PrintProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrintProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set());
  const cookbooks = projects.filter((project) => project.kind !== "printProject");
  const printProjects = projects.filter((project) => project.kind === "printProject");

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadPrintProjects(user.uid);
      setProjects(next);
      // Back up any locally-known unlock that never reached Firestore (a
      // swallowed write, or a signed-out purchase). Best-effort — never blocks
      // the list from rendering.
      void reconcileCookbookProjectUnlocks(user.uid);
      const purchased = await Promise.all(
        next.map(async (project) => [
          project.id,
          await loadCookbookProjectUnlock(user.uid, project.id).catch(() => false),
        ] as const),
      );
      setPurchasedIds(new Set(purchased.filter(([, unlocked]) => unlocked).map(([id]) => id)));
    } catch {
      setError("We couldn’t load your projects. Try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      setShowLogin(true);
      return;
    }
    void refresh();
  }, [ready, user, refresh]);

  async function confirmDelete() {
    if (!user || !pendingDelete) return;
    setDeleting(true);
    try {
      await deletePrintProject(user.uid, pendingDelete.id);
      setProjects((current) => current.filter((project) => project.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setError("That project couldn’t be deleted. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader sticky />
      <main className="mx-auto w-full max-w-5xl px-cp-6 py-cp-8">
        <div className="mb-cp-6">
          <h1 className="text-cp-page-title font-bold tracking-tight">Projects</h1>
          <p className="mt-2 text-cp-body text-ink-soft">Open or remove your saved cookbooks and print projects.</p>
        </div>

        {loading ? (
          <div className="recipe-loading-state min-h-48"><SpinnerIcon size={ICON_SIZE.lg} /><span>Loading projects…</span></div>
        ) : error && projects.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-cp-6 text-center">
            <p className="text-error">{error}</p>
            <button type="button" className="btn btn-secondary mt-cp-4" onClick={() => void refresh()}>Try again</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-line bg-card px-cp-6 py-cp-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cp-accent-soft)]">
              <BookIcon size={28} className="text-[var(--cp-accent-ink)]" />
            </div>
            <h2 className="mt-cp-4 text-cp-section-title font-bold">No saved projects yet</h2>
            <p className="mt-2 max-w-sm text-cp-body text-ink-soft">Build a cookbook or print project and it’ll show up here, ready to reopen anytime.</p>
            <Link href="/" className="btn btn-primary mt-cp-5">Add a recipe</Link>
          </div>
        ) : (
          <>
            {error && <p className="mb-cp-4 rounded-lg border border-[var(--cp-error-border)] bg-[var(--cp-error-soft)] p-cp-3 text-cp-small text-error">{error}</p>}
            {([
              ["Cookbooks", cookbooks],
              ["Print projects", printProjects],
            ] as const).map(([heading, groupedProjects]) => groupedProjects.length > 0 && (
              <section key={heading} className="mb-cp-8">
                <h2 className="mb-cp-4 text-cp-section-title font-bold">{heading}</h2>
                <ul className="grid gap-cp-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupedProjects.map((project) => (
                <li key={project.id} className="group relative flex min-h-44 flex-col overflow-hidden rounded-xl border border-line bg-card transition-colors hover:border-line-strong">
                  <Link
                    href={`/print?project=${encodeURIComponent(project.id)}`}
                    className="absolute inset-0 z-10 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-accent-ink)]"
                    aria-label={`Open ${project.title || (project.kind === "printProject" ? "Untitled print project" : "Untitled cookbook")}`}
                  />
                  <ProjectCover project={project} />
                  <div className="flex flex-1 flex-col p-cp-4">
                    <div className="flex items-start justify-between gap-cp-3">
                      <div className="min-w-0">
                      <span className="text-cp-label font-bold uppercase tracking-wide text-ink-soft">
                        {project.kind === "printProject" ? "Print project" : "Cookbook"}
                      </span>
                      <h3 className="mt-1 line-clamp-2 text-cp-section-title font-bold">{project.title || (project.kind === "printProject" ? "Untitled print project" : "Untitled cookbook")}</h3>
                      </div>
                    <IconButton className="relative z-20" tone="danger" aria-label={`Delete ${project.title || "project"}`} onClick={() => setPendingDelete(project)}>
                      <TrashIcon size={ICON_SIZE.md} />
                    </IconButton>
                    </div>
                    <div className="mt-cp-3 flex flex-wrap items-center gap-2 text-cp-caption text-ink-soft">
                      <span>{recipeCount(project)} recipe{recipeCount(project) === 1 ? "" : "s"}</span>
                      <span aria-hidden>·</span>
                      <span>Updated {projectDate(project)}</span>
                    </div>
                    <div className="mt-cp-3">
                      {project.kind === "printProject" ? (
                        <Badge>No purchase needed</Badge>
                      ) : purchasedIds.has(project.id) ? (
                        <Badge tone="success"><CheckIcon size={ICON_SIZE.sm} /> Purchased</Badge>
                      ) : (
                        <Badge>Not purchased</Badge>
                      )}
                    </div>
                  </div>
                </li>
              ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete project?"
        description={<>“{pendingDelete?.title || (pendingDelete?.kind === "printProject" ? "Untitled print project" : "Untitled cookbook")}” will be permanently removed from your account.</>}
        confirmLabel="Delete project"
        confirmIcon={<TrashIcon size={ICON_SIZE.md} />}
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />

      {showLogin && !user && <CookPilotLoginDialog onClose={() => setShowLogin(false)} onAuthenticated={() => setShowLogin(false)} />}
    </div>
  );
}
