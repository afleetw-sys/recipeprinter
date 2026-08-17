"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, IconButton } from "@/components/Controls";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { useProjectMeta } from "@/lib/project";
import { useQueue } from "@/lib/queue";
import { useRouter } from "next/navigation";
import { BookIcon, CheckIcon, ICON_SIZE, SpinnerIcon, TrashIcon } from "@/components/icons";
import { deletePrintProject, loadPrintProjects } from "@/lib/printProjects";
import {
  deleteDuplicateProjects,
  grantCookbookUnlock,
  planDuplicateCleanup,
} from "@/lib/duplicateProjects";
import { track } from "@/lib/analytics";
import { loadCookbookProjectUnlockIds } from "@/lib/cookbookUnlocks";
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
  const router = useRouter();
  const { startNewProject } = useProjectMeta();
  const { items: queueItems } = useQueue();

  /**
   * The missing entry point. Until now the only way into a cookbook was the
   * mode switch on the print page, and once you had one it returned you to that
   * same book — so a customer who wanted a SECOND cookbook had no way to make
   * one, and no way to buy one. Every book is its own project and its own
   * purchase, so "new" has to mean a new project id.
   *
   * Deliberately does NOT clear the recipe list. Emptying it to hand the cook a
   * blank page throws away work to make room for work — the recipes they have
   * are exactly what a new book gets made from, which is what "make it a
   * cookbook" has always done. All that has to be new is the project IDENTITY,
   * so the book being built is its own document and its own purchase rather
   * than an edit of whichever one happened to be open.
   *
   * With recipes on hand there is nothing left to collect, so this goes straight
   * to the workspace. With none, it routes to the importer instead and
   * `cookbookIntent` carries the choice across that detour, so the cook still
   * lands in a book rather than in recipe cards.
   */
  function startNewCookbook() {
    const hasRecipes = queueItems.some((item) => item.status === "ready" && item.recipe);
    startNewProject({ cookbook: true });
    router.push(hasRecipes ? "/print" : "/");
  }
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
      // No local→server unlock backfill here any more: unlocks are written by
      // the RevenueCat webhook, and the client is denied write access to them.
      // Two collection reads for the whole account, not two point lookups per
      // project — see `loadCookbookProjectUnlockIds`.
      const unlockedIds = await loadCookbookProjectUnlockIds(user.uid);
      const purchasedProjectIds = new Set(
        next.filter((project) => unlockedIds.has(project.id)).map((project) => project.id),
      );
      // Clear the copies an old autosave bug forked into this account before
      // rendering, so they are never on screen. Silent and unprompted: nobody
      // asked for thirty copies of their cookbook, so nobody is asked to tidy
      // them up. Purchased copies are pinned — an unlock hangs off its own
      // project id, and no cleanup is worth stranding a purchase.
      const { keep, remove, granted } = await planDuplicateCleanup(user.uid, next, {
        isPurchased: (project) => purchasedProjectIds.has(project.id),
        grantUnlock: grantCookbookUnlock,
      });
      // A keeper handed the unlock of a copy being deleted is purchased now.
      granted.forEach((projectId) => purchasedProjectIds.add(projectId));
      setPurchasedIds(purchasedProjectIds);
      setProjects(keep);
      if (remove.length > 0) {
        void deleteDuplicateProjects(user.uid, remove).then((cleaned) => {
          if (cleaned > 0) track("duplicate_projects_cleaned", { count: cleaned });
        });
      }
    } catch {
      setError("We couldn’t load your projects. Try again.");
    } finally {
      setLoading(false);
    }
    // Keyed on the uid, not the User object: Firebase hands `onAuthStateChanged`
    // a fresh object on every token refresh (roughly hourly), and depending on
    // the object identity re-ran this whole load — every project document and
    // both unlock collections — for an account that hadn't changed. The print
    // page already keys its own account effects this way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      setShowLogin(true);
      return;
    }
    void refresh();
    // Same reasoning as `refresh` above — a token refresh must not re-trigger
    // the load. Signing in or out still changes the uid, so this still fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.uid, refresh]);

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
      {/* py-cp-7, not py-cp-8: the CookPilot spacing scale tops out at cp-7
          (32px), so `py-cp-8` was a class Tailwind never emitted — the page had
          no vertical padding at all, which is why the title sat against the
          sticky header and the last row of cards ran into the bottom edge. */}
      <main className="mx-auto w-full max-w-5xl px-cp-6 py-cp-7">
        {/* Page header on the same scale as every other standalone page (see
            `PageHeader` in components/PageShell): an h1 at --cp-fs-hero-sm over
            a --cp-fs-body-lg lede. This used to reach for `text-cp-page-title`
            and `text-cp-section-title`, neither of which exists in the Tailwind
            scale — so Tailwind emitted nothing, preflight's `font-size: inherit`
            took over, and the page title rendered at the same plain body size as
            the card titles below it. */}
        <header className="mb-cp-7 flex flex-wrap items-start justify-between gap-cp-4">
          <div>
            <h1 className="text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">Projects</h1>
            <p className="mt-cp-3 text-cp-body-lg text-ink-soft leading-relaxed">
              Open or remove your saved cookbooks and print projects.
            </p>
          </div>
          <button type="button" className="btn btn-primary flex-shrink-0" onClick={startNewCookbook}>
            <BookIcon size={ICON_SIZE.md} />
            New cookbook
          </button>
        </header>

        {loading ? (
          <div className="recipe-loading-state min-h-48"><SpinnerIcon size={ICON_SIZE.lg} /><span>Loading projects…</span></div>
        ) : error && projects.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-cp-6 text-center">
            <p className="text-error">{error}</p>
            <button type="button" className="btn btn-secondary mt-cp-4" onClick={() => void refresh()}>Try again</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-line bg-card px-cp-6 py-cp-7 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cp-accent-soft)]">
              <BookIcon size={28} className="text-[var(--cp-accent-ink)]" />
            </div>
            <h2 className="mt-cp-4 text-cp-h2 font-extrabold tracking-[-0.02em]">No saved projects yet</h2>
            <p className="mt-cp-2 max-w-sm text-cp-body text-ink-soft leading-relaxed">Build a cookbook or print project and it’ll show up here, ready to reopen anytime.</p>
            <Link href="/" className="btn btn-primary mt-cp-5">Add a recipe</Link>
          </div>
        ) : (
          <>
            {error && <p className="mb-cp-4 rounded-lg border border-[var(--cp-error-border)] bg-[var(--cp-error-soft)] p-cp-3 text-cp-small text-error">{error}</p>}
            {([
              ["Cookbooks", cookbooks],
              ["Print projects", printProjects],
            ] as const).map(([heading, groupedProjects]) => groupedProjects.length > 0 && (
              <section key={heading} className="mb-cp-7">
                <h2 className="mb-cp-4 text-cp-h2 font-extrabold tracking-[-0.02em]">{heading}</h2>
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
                        {/* A card title sits UNDER the section heading in the
                            hierarchy, so it takes --cp-fs-body, not the section
                            heading's size. */}
                        <h3 className="mt-cp-1 line-clamp-2 text-cp-body font-bold leading-snug">
                          {project.title || (project.kind === "printProject" ? "Untitled print project" : "Untitled cookbook")}
                        </h3>
                      </div>
                      <IconButton className="relative z-20" tone="danger" aria-label={`Delete ${project.title || "project"}`} onClick={() => setPendingDelete(project)}>
                        <TrashIcon size={ICON_SIZE.md} />
                      </IconButton>
                    </div>
                    <div className="mt-cp-3 flex flex-wrap items-center gap-cp-2 text-cp-caption text-ink-soft">
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
