"use client";

import { useEffect } from "react";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { loadPrintProjects } from "@/lib/printProjects";
import type { PrintProject } from "@/types/recipe";

/**
 * Reads the signed-in account's projects and hands them up. Renders nothing.
 *
 * It exists purely as a seam. `useCookPilotAuth` reaches `firebase/auth` and
 * `firebase/functions`, and `loadPrintProjects` reaches Firestore — so anything
 * that imports them statically ships Firebase to whatever route it is on. The
 * front door is statically prerendered and carries the organic search traffic;
 * putting Firebase on it to draw four cards, for a visitor who has never signed
 * in and has no cards, is the same trade `AccountControl` already declined for
 * the avatar in the header.
 *
 * So the shelf loads this on demand, and only when the browser has a record of
 * having been signed in.
 */
export default function AccountProjectsLoader({
  onLoaded,
}: {
  onLoaded: (projects: PrintProject[]) => void;
}) {
  const { user, ready } = useCookPilotAuth();

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    loadPrintProjects(user.uid)
      .then((projects) => {
        if (!cancelled) onLoaded(projects);
      })
      // A failed read just means the shelf shows what's on the device. The
      // importer above is the point of the page and doesn't depend on it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, user, onLoaded]);

  return null;
}
