"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, IconButton } from "@/components/Controls";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { BookIcon, CheckIcon, ICON_SIZE, SpinnerIcon, TrashIcon } from "@/components/icons";
import { deletePrintProject, loadPrintProjects } from "@/lib/printProjects";
import { loadCookbookProjectUnlock } from "@/lib/cookbookUnlocks";
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

function ProjectCover({ project }: { project: PrintProject }) {
  const cover = project.cover;
  const images = cover?.layout === "collage"
    ? cover.gridImages ?? []
    : cover?.imageUrl
      ? [cover.imageUrl]
      : cover?.gridImages ?? [];
  return (
    <div className={`project-cover project-cover--${images.length > 1 ? "collage" : images.length ? "photo" : "type"}`}>
      {images.slice(0, 6).map((url, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${url}-${index}`} src={url} alt="" />
      ))}
      <div className="project-cover__scrim" aria-hidden />
      <div className="project-cover__label">
        {cover?.subtitle && <span>{cover.subtitle}</span>}
        <strong>{cover?.title || project.title || "Untitled cookbook"}</strong>
        {cover?.author && <small>{cover.author}</small>}
      </div>
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

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadPrintProjects(user.uid);
      setProjects(next);
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
          <div className="rounded-xl border border-line bg-card p-cp-8 text-center shadow-cp-sm">
            <BookIcon size={32} className="mx-auto text-ink-soft" />
            <h2 className="mt-cp-3 text-cp-section-title font-bold">No saved projects yet</h2>
            <p className="mt-2 text-cp-body text-ink-soft">Your saved cookbooks will appear here.</p>
            <Link href="/" className="btn btn-primary mt-cp-5">Add a recipe</Link>
          </div>
        ) : (
          <>
            {error && <p className="mb-cp-4 rounded-lg border border-[var(--cp-error-border)] bg-[var(--cp-error-soft)] p-cp-3 text-cp-small text-error">{error}</p>}
            <ul className="grid gap-cp-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id} className="group relative flex min-h-44 flex-col overflow-hidden rounded-xl border border-line bg-card shadow-cp-sm transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-cp-md">
                  <Link
                    href={`/print?project=${encodeURIComponent(project.id)}`}
                    className="absolute inset-0 z-10 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-accent-ink)]"
                    aria-label={`Open ${project.title || "Untitled cookbook"}`}
                  />
                  <ProjectCover project={project} />
                  <div className="flex flex-1 flex-col p-cp-4">
                    <div className="flex items-start justify-between gap-cp-3">
                      <div className="min-w-0">
                      <span className="text-cp-label font-bold uppercase tracking-wide text-ink-soft">
                        {project.kind === "printProject" ? "Print project" : "Cookbook"}
                      </span>
                      <h2 className="mt-1 line-clamp-2 text-cp-section-title font-bold">{project.title || "Untitled cookbook"}</h2>
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
          </>
        )}
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete project?"
        description={<>“{pendingDelete?.title || "Untitled cookbook"}” will be permanently removed from your account.</>}
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
