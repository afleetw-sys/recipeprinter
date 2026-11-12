/** This page's path and query, without the origin or hash: where a purchase
 *  that stops for sign-in should come back to. Null without a window. */
export function currentPagePath(): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}
