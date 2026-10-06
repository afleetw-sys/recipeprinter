export type ScreenshotShortcut =
  | "macos_full_screen"
  | "macos_selection"
  | "macos_screenshot_app"
  | "print_screen"
  | "windows_snipping_tool";

/**
 * Recognizes screenshot shortcuts a browser may receive. This deliberately
 * does not claim a screenshot completed: operating systems commonly consume
 * these keystrokes before the page sees them, and mobile hardware-button
 * screenshots have no web event at all.
 */
export function screenshotShortcutFrom(
  event: KeyboardEvent,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): ScreenshotShortcut | null {
  if (event.repeat) return null;
  if (event.key === "PrintScreen") return "print_screen";

  const key = event.key.toLowerCase();
  const modified = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey;
  if (modified && /^mac/i.test(platform)) {
    if (key === "3") return "macos_full_screen";
    if (key === "4") return "macos_selection";
    if (key === "5") return "macos_screenshot_app";
  }
  if (modified && /^win/i.test(platform) && key === "s") return "windows_snipping_tool";

  return null;
}
