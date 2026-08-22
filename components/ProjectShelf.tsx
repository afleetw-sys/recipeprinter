"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ProjectCover } from "@/components/ProjectCover";
import { loadLocalProjects } from "@/lib/localProjects";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import type { PrintProject } from "@/types/recipe";

/** Firebase lives behind this, and only loads for a browser that has an
    account. See components/AccountProjectsLoader. */
const AccountProjectsLoader = dynamic(() => import("@/components/AccountProjectsLoader"), {
  ssr: false,
});

/**
 * What you already have, on the way in.
 *
 * This belongs at the front door and nowhere else. It used to live inside the
 * empty studio, which made the two screens near-copies of each other: the
 * homepage and an empty project both offered an importer, a headline and a
 * list of your work, differing mostly in wording. Now the door shows what you
 * have and lets you start something; a project shows the project. Being inside
 * an empty document is not the moment to be offered four other documents.
 *
 * Renders nothing at all when there is nothing — an empty list inside an empty
 * state says "you have none", which for a signed-out cook with books on this
 * device would be a lie. It's the same lie the Projects page used to tell.
 */
export function ProjectShelf() {
  /** Books filed on this device. Pure localStorage, no account, no Firebase —
      so a signed-out cook sees their own books on the first paint. */
  const [local, setLocal] = useState<PrintProject[]>([]);
  const [account, setAccount] = useState<PrintProject[]>([]);
  const [wantsAccount, setWantsAccount] = useState(false);

  useEffect(() => {
    setLocal(loadLocalProjects());
    setWantsAccount(readCookPilotWasSignedIn());
  }, []);

  const onLoaded = useCallback((projects: PrintProject[]) => setAccount(projects), []);

  /**
   * Both shelves, merged the way the Projects page merges them: the account's
   * own documents plus anything filed on this device, with the account copy
   * winning on a shared id.
   */
  const inAccount = new Set(account.map((project) => project.id));
  const recent = [...account, ...local.filter((project) => !inAccount.has(project.id))].sort(
    (a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0),
  );

  const shelf = recent.slice(0, 4);
  // The loader has to stay mounted even with nothing to show yet — it IS what
  // produces the account half. Only the visible shelf is conditional.
  if (shelf.length === 0) {
    return wantsAccount ? <AccountProjectsLoader onLoaded={onLoaded} /> : null;
  }

  return (
    <section className="rp-shelf" aria-labelledby="rp-shelf-heading">
      {wantsAccount && <AccountProjectsLoader onLoaded={onLoaded} />}
      <div className="rp-shelf__head">
        <h2
          id="rp-shelf-heading"
          className="text-cp-small font-bold uppercase tracking-wide text-ink-soft"
        >
          Pick up where you left off
        </h2>
        <Link href="/projects" className="text-cp-small text-ink-soft underline underline-offset-2">
          All projects
        </Link>
      </div>
      <ul className="rp-shelf__grid">
        {shelf.map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${encodeURIComponent(project.id)}`} className="rp-shelf__card">
              <ProjectCover project={project} />
              <span className="rp-shelf__card-text">
                <span className="rp-shelf__card-title">
                  {project.title ||
                    (project.kind === "printProject" ? "Untitled recipe cards" : "Untitled cookbook")}
                </span>
                <span className="rp-shelf__card-meta">
                  {project.kind === "printProject" ? "Recipe cards" : "Cookbook"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
