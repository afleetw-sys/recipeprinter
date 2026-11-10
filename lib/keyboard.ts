/**
 * Is the on-screen keyboard up, and how much of the window does it cover?
 *
 * Two kinds of browser, two measurements, one answer:
 *
 * - Safari overlays the keyboard: the page keeps its height (`innerHeight`)
 *   and only the visual viewport shrinks, so the keyboard is the difference.
 * - Chrome on Android, told `interactive-widget=resizes-content` in the root
 *   viewport (app/layout.tsx), shrinks the page itself. `innerHeight` and the
 *   visual viewport drop together and their difference reads 0, so the
 *   keyboard is measured against the tallest the page has been at this width
 *   instead.
 *
 * Only while something editable has focus: Safari's own toolbars also change
 * the visual viewport as the page scrolls, and with no field to type in there
 * is no keyboard, whatever the numbers say.
 */

/** Less than this is a browser toolbar or a hardware keyboard's shortcut
    strip, not a keyboard someone is typing on. */
const KEYBOARD_MIN = 120;

let tallest = { width: 0, height: 0 };

function isEditable(node: Element | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.tagName === "INPUT" ||
    node.tagName === "TEXTAREA" ||
    node.tagName === "SELECT" ||
    node.isContentEditable
  );
}

export function readKeyboard(): { open: boolean; inset: number } {
  if (typeof window === "undefined") return { open: false, inset: 0 };
  const viewport = window.visualViewport;
  // Rotating starts a new tallest; so does any change of width.
  if (tallest.width !== window.innerWidth) tallest = { width: window.innerWidth, height: 0 };
  tallest.height = Math.max(tallest.height, window.innerHeight);
  if (!viewport || !isEditable(document.activeElement)) return { open: false, inset: 0 };
  // What overlays the page from below (Safari), for bars that sit above it.
  const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  // What is missing from the page's full height, by either route.
  const covered = Math.max(inset, tallest.height - viewport.height - viewport.offsetTop);
  return { open: covered >= KEYBOARD_MIN, inset };
}
