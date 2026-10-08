/**
 * Which app is showing the page, in words PostHog's own `$browser` does not
 * have.
 *
 * PostHog names the browser engine, so every iPhone app that embeds a web view
 * (the Google app, Instagram, Facebook, TikTok…) arrives as "Mobile Safari"
 * with no version, indistinguishable from real Safari. Those are exactly the
 * places printing breaks: each app replaces `window.print()` with its own
 * hand-off, or (on Android) leaves it doing nothing. This reads the markers the
 * apps put in their user agents so a breakdown can name them, and anything it
 * does not know comes out as "unknown" beside `$raw_user_agent` for adding
 * later.
 */
export type BrowserApp =
  | "google-app"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "pinterest"
  | "snapchat"
  | "linkedin"
  | "twitter"
  | "android-webview"
  | "ios-webview"
  | "chrome-ios"
  | "firefox-ios"
  | "edge-ios"
  | "duckduckgo"
  | "brave"
  | "safari"
  | "samsung"
  | "edge"
  | "firefox"
  | "opera"
  | "chrome"
  | "unknown";

// First match wins, so in-app browsers (which also say "Safari" or "Chrome")
// come before the browsers they are built on.
const RULES: Array<[RegExp, BrowserApp]> = [
  [/\bGSA\//, "google-app"],
  [/Instagram/, "instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/, "facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "tiktok"],
  [/Pinterest/, "pinterest"],
  [/Snapchat/, "snapchat"],
  [/LinkedInApp/, "linkedin"],
  [/Twitter/, "twitter"],
  [/CriOS\//, "chrome-ios"],
  [/FxiOS\//, "firefox-ios"],
  [/EdgiOS\//, "edge-ios"],
  [/DuckDuckGo|Ddg\//, "duckduckgo"],
  [/SamsungBrowser\//, "samsung"],
  [/; wv\)/, "android-webview"],
  [/Edg\//, "edge"],
  [/OPR\/|OPT\//, "opera"],
  [/Firefox\//, "firefox"],
  [/Chrome\//, "chrome"],
  // Real Safari says which version it is; an app's web view leaves it out.
  [/(iPhone|iPad|iPod).*Version\/[\d.]+.*Safari\//, "safari"],
  [/(iPhone|iPad|iPod)/, "ios-webview"],
  [/Version\/[\d.]+.*Safari\//, "safari"],
];

export function browserAppFrom(userAgent: string, brave = false): BrowserApp {
  if (brave) return "brave";
  for (const [pattern, app] of RULES) if (pattern.test(userAgent)) return app;
  return "unknown";
}

/** The app showing this page, read once from the running browser. */
export function currentBrowserApp(): BrowserApp {
  if (typeof navigator === "undefined") return "unknown";
  const brave = "brave" in navigator;
  return browserAppFrom(navigator.userAgent, brave);
}

/**
 * Whether `window.print` is still the browser's own.
 *
 * In-app browsers swap it for a function that hands off to the app; some of
 * those work (Chrome, Firefox, DuckDuckGo on iOS) and some do not (the Google
 * app's throws). A built-in function stringifies as `[native code]`; a
 * replacement shows its source.
 */
export function printIsNative(): boolean {
  if (typeof window === "undefined" || typeof window.print !== "function") return false;
  try {
    return /\[native code\]/.test(Function.prototype.toString.call(window.print));
  } catch {
    return false;
  }
}
