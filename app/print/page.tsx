import { redirect } from "next/navigation";

/**
 * `/print` was the workspace. It is now `/projects/<id>`.
 *
 * This stays as a redirect rather than being deleted because `/print?project=`
 * links are in the wild — in the account menu of any tab still open, in
 * bookmarks, and in the address bar of anyone who got there before the change.
 * Those carry an id and can be forwarded exactly.
 *
 * Bare `/print` cannot: it named "whatever is in session storage", which is a
 * fact this server has no access to. So it lands on the home studio, which
 * lists the projects on this device — including the working copy — and is a
 * better answer than a 404 for a URL that never identified anything.
 *
 * Note that `/print/<slug>`, the public share link, is untouched. Disentangling
 * it from this route is half the point: one was a private session, the other is
 * a page we ask search engines to index, and they used to differ by a slash.
 */
export default function PrintRedirect({
  searchParams,
}: {
  searchParams: { project?: string | string[] };
}) {
  const project = Array.isArray(searchParams.project)
    ? searchParams.project[0]
    : searchParams.project;
  redirect(project ? `/projects/${encodeURIComponent(project)}` : "/");
}
