import { Studio } from "@/components/print/Studio";

/**
 * A project, at its own address.
 *
 * The id is a path segment rather than a query string because it is not
 * optional and never was: every session of this screen has always been *some*
 * project. `/print` simply declined to say which one, so the working copy — the
 * thing people actually spend their time in — was the only document in the
 * product with no URL. Now it has one, and the back button, a bookmark and a
 * second tab all mean what people expect them to.
 *
 * Deliberately a server component that does nothing but read `params`: the
 * studio is a large client bundle, and keeping the route itself on the server
 * means the id is known before any JavaScript runs.
 */
export default function ProjectPage({ params }: { params: { id: string } }) {
  return <Studio projectId={decodeURIComponent(params.id)} />;
}
