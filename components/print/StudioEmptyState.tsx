"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ImportPanel } from "@/components/ImportPanel";
import { ProjectCover } from "@/components/ProjectCover";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { loadLocalProjects } from "@/lib/localProjects";
import { loadPrintProjects } from "@/lib/printProjects";
import type { QueueItem } from "@/types/recipe";
import type { PrintProject } from "@/types/recipe";

/**
 * The studio with nothing open — which is to say, the front door.
 *
 * What used to be here was an error message: "Nothing to print — we couldn't
 * find those recipes. They may have been removed, or this page was opened
 * directly", with a link back to the homepage. It assumed you had arrived by
 * mistake, because at the time you probably had: importing happened somewhere
 * else and you were only ever sent here with recipes in hand.
 *
 * Three zones, in order of what someone needs:
 *
 *  1. A line saying what this is. Not a marketing hero — the homepage keeps
 *     that job — just enough for someone who clicked the logo and has never
 *     seen the product.
 *  2. The importer, full width, every method. The largest thing on screen,
 *     because it is the only thing to do here.
 *  3. What you already have, if you have anything. Someone with five saved
 *     cookbooks landing on an empty studio must not be shown a page implying
 *     they have none — the same lie the Projects page used to tell a signed-out
 *     visitor. Absent entirely when there is genuinely nothing, so it never
 *     becomes an empty list inside an empty state.
 */
export function StudioEmptyState({
  items,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
  onRemoveRecipe,
}: {
  items: QueueItem[];
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  const { user, ready } = useCookPilotAuth();
  const [recent, setRecent] = useState<PrintProject[]>([]);

  /**
   * Both shelves, merged the way the Projects page merges them: the account's
   * own documents plus anything filed on this device, with the account copy
   * winning on a shared id. Read on the device first so a signed-out cook sees
   * their books immediately, then topped up once the account answers.
   */
  useEffect(() => {
    let cancelled = false;
    const local = loadLocalProjects();
    if (!cancelled) setRecent(local);
    if (!ready || !user) return;
    loadPrintProjects(user.uid)
      .then((account) => {
        if (cancelled) return;
        const inAccount = new Set(account.map((project) => project.id));
        const merged = [...account, ...local.filter((project) => !inAccount.has(project.id))];
        merged.sort(
          (a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0),
        );
        setRecent(merged);
      })
      // A failed read just means no shelf on this screen. The importer below is
      // the point of the page and does not depend on it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const shelf = recent.slice(0, 4);

  return (
    <div className="rp-studio-empty">
      <div className="rp-studio-empty__intro">
        <h1 className="text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">
          Add a recipe to start
        </h1>
        <p className="mt-cp-3 text-cp-body-lg text-ink-soft leading-relaxed">
          Paste a link, upload a photo, or paste the text. Every recipe becomes a page you can
          print — and a set of them can become a cookbook.
        </p>
      </div>

      <div className="rp-studio-empty__import">
        <ImportPanel
          items={items}
          onAddUrl={onAddUrl}
          onAddImages={onAddImages}
          onAddText={onAddText}
          onAddCookPilotRecipes={onAddCookPilotRecipes}
          onRemoveRecipe={onRemoveRecipe}
        />
      </div>

      {shelf.length > 0 && (
        <section className="rp-studio-empty__shelf" aria-labelledby="rp-studio-shelf-heading">
          <div className="rp-studio-empty__shelf-head">
            <h2 id="rp-studio-shelf-heading" className="text-cp-small font-bold uppercase tracking-wide text-ink-soft">
              Pick up where you left off
            </h2>
            <Link href="/projects" className="text-cp-small text-ink-soft underline underline-offset-2">
              All projects
            </Link>
          </div>
          <ul className="rp-studio-empty__shelf-grid">
            {shelf.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/print?project=${encodeURIComponent(project.id)}`}
                  className="rp-studio-empty__card"
                >
                  <ProjectCover project={project} />
                  <span className="rp-studio-empty__card-text">
                    <span className="rp-studio-empty__card-title">
                      {project.title ||
                        (project.kind === "printProject" ? "Untitled recipe cards" : "Untitled cookbook")}
                    </span>
                    <span className="rp-studio-empty__card-meta">
                      {project.kind === "printProject" ? "Recipe cards" : "Cookbook"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
