/**
 * Keeps a page that a browser translator has rewritten from crashing.
 *
 * React updates the page by pointing at the exact text nodes it created:
 * "insert this before that one", "remove that one". A translator (Chrome's
 * Translate, and extensions that edit text) throws those nodes away and puts
 * wrapped, translated copies where they were. Nothing breaks until React next
 * updates something beside translated text, such as Print swapping its icon
 * for a spinner; then it names a node that is no longer there, the browser
 * throws NotFoundError, and React unmounts the whole screen. On /print that is
 * the error boundary, which redraws the page, which gets translated again, so
 * one cook hit the crash on every press (a session replay, 2026-10-11).
 *
 * React leaves this to the page (facebook/react#11538). The guard is the
 * usual one: when the node React names is not where it left it, do the nearest
 * harmless thing instead of throwing. An insert lands at the end of the parent
 * rather than at the lost position; a remove of something already gone does
 * nothing. A translated page may then show a label slightly out of place or
 * left in the old language, which is the translator's doing either way, and
 * the page keeps working.
 */
let installed = false;

export function installTranslatedPageGuard(): void {
  if (installed || typeof Node === "undefined") return;
  installed = true;

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, reference) as T;
  };

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
}
