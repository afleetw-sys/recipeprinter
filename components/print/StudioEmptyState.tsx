"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { ImportPanel } from "@/components/ImportPanel";
import { PendingImportRows } from "@/components/print/PendingImportRows";
import { ProjectCover } from "@/components/ProjectCover";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { flipTransform } from "@/lib/flipTransform";
import { loadLocalProjects } from "@/lib/localProjects";
import { takeArrivingImporter } from "@/lib/studioHandoff";
import { loadPrintProjects } from "@/lib/printProjects";
import type { QueueItem } from "@/types/recipe";
import type { PrintProject } from "@/types/recipe";

/** The geometry the hand-off animation flies out of (see the print page). */
export interface StudioHandoffRects {
  pendingCard: DOMRect | null;
  importPanel: DOMRect | null;
}

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
  canRetry,
  onRetry,
  captureRef,
}: {
  items: QueueItem[];
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
  canRetry: (item: QueueItem) => boolean;
  onRetry: (id: string) => void;
  /** Where this layout sits, handed up so the workspace can animate out of it
      once the first recipe lands. See `runStudioHandoff` on the print page. */
  captureRef: MutableRefObject<StudioHandoffRects>;
}) {
  const { user, ready } = useCookPilotAuth();
  const [recent, setRecent] = useState<PrintProject[]>([]);
  const pendingRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const pending = items.filter((item) => item.status !== "ready");

  /**
   * Keep the two rects that the hand-off animation flies out of.
   *
   * Measured here rather than read later because by the time the workspace
   * exists this component is gone — the switch is an early return in the print
   * page, not a sibling swap. A ref is the only thing that survives it.
   */
  const capture = useCallback(() => {
    captureRef.current = {
      pendingCard: pendingRef.current?.getBoundingClientRect() ?? null,
      importPanel: panelRef.current?.getBoundingClientRect() ?? null,
    };
  }, [captureRef]);

  useLayoutEffect(() => {
    capture();
    window.addEventListener("resize", capture);
    return () => window.removeEventListener("resize", capture);
  });

  /**
   * Arrive by travelling, not by appearing.
   *
   * The homepage hands an import over by navigating here, so without this the
   * importer someone was just typing into is replaced by a different-looking
   * one somewhere else on screen, with nothing connecting them. It is the same
   * object; showing it move is the only way to say so.
   *
   * Runs once, on mount, and only when the homepage actually left a rect behind
   * (`takeArrivingImporter` clears as it reads) — so a bookmark, the logo or
   * Back all just render, with nothing flying anywhere.
   */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || typeof window === "undefined") return;
    const from = takeArrivingImporter();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const transform = flipTransform(from, el.getBoundingClientRect());
    if (!transform) return;
    el.style.transformOrigin = "top left";
    // Shorter than the studio-to-workspace hand-off: this one is a settle
    // between two nearby positions, not a journey across the screen.
    el.animate(
      [
        { transform },
        { transform: "none" },
      ],
      { duration: 320, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "backwards" },
    );
    // Mount only — a later re-render must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      <div className="rp-studio-empty__import" ref={panelRef}>
        <ImportPanel
          // The empty studio is nothing but this panel — it must not fold its
          // options away the moment a parse starts. `items` still goes through
          // so the CookPilot picker can tell what's already been added.
          expanded
          items={items}
          onAddUrl={onAddUrl}
          onAddImages={onAddImages}
          onAddText={onAddText}
          onAddCookPilotRecipes={onAddCookPilotRecipes}
          onRemoveRecipe={onRemoveRecipe}
        />
      </div>

      {/* The import in flight. Without this, submitting cleared the field and
          then nothing happened at all for the second or four that parsing takes
          — the one moment someone most needs to be told something is
          happening. The rail's own pending row, so the thing that appears here
          is the thing that ends up over there. */}
      {pending.length > 0 && (
        <div className="rp-studio-empty__pending" ref={pendingRef}>
          <PendingImportRows
            items={pending}
            canRetry={canRetry}
            onRetry={onRetry}
            onRemove={onRemoveRecipe}
          />
        </div>
      )}

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
                  href={`/projects/${encodeURIComponent(project.id)}`}
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
