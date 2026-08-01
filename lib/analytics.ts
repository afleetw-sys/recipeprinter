import type { PostHog } from "posthog-js";
import { isProductionRuntime } from "@/lib/appEnvironment";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { ImportMethod } from "@/types/recipe";
import type { FeedbackType } from "@/lib/feedback";

/** What product a paywall or purchase refers to. */
type PurchasedProduct = "premium_template" | "cookbook";

/**
 * Why an import failed, as a small closed vocabulary rather than a free-text
 * message. The raw message still rides along as `reason` for a human reading a
 * single event, but only these buckets are groupable — so "how often does the
 * photo parser find nothing" is a chart instead of a session-replay hunt.
 *   - blocked / not_found: the source site refused us or 404'd (URL only).
 *   - no_recipe: we reached the parser and it found no recipe in the input.
 *   - no_files: the import was submitted with nothing usable selected — the
 *     "Choose at least one photo" dead-end, tracked so that class of bug is a
 *     number instead of a session replay.
 *   - decode_failed: the browser couldn't even read the chosen image.
 *   - too_large: the image was still over budget after resizing.
 *   - backend_unavailable: auth / App Check / Functions config failure.
 *   - timeout: the parser ran past its deadline.
 *   - unknown: anything we didn't classify.
 */
export type ImportFailureCode =
  | "blocked"
  | "not_found"
  | "no_recipe"
  | "no_files"
  | "decode_failed"
  | "too_large"
  | "backend_unavailable"
  | "timeout"
  | "unknown";

/**
 * Every event RecipePrinter sends, with its required properties.
 *
 * Keeping this a closed map is the point: `track()` won't compile for an
 * event name or property that isn't declared here, so the dashboard can't
 * silently fill up with `print_done`, `printCompleted` and `print-complete`
 * as three separate things measuring the same moment. The property types are
 * borrowed from the real domain types rather than restated as strings, so a
 * new card size or import method can't drift out of sync with what we record.
 */
type EventProps = {
  // ---- Import ----------------------------------------------------------
  // Fired as a trio so failures are visible. Recording only successes makes
  // a broken parser look identical to a visitor who wandered off: a pageview,
  // no print, no explanation. `hostname` (never the full URL — that's what
  // someone is cooking) is what tells us which recipe sites we choke on.
  /** An import was accepted and parsing began. The denominator. */
  recipe_import_started: { source: ImportMethod; hostname?: string };
  /** Parsing produced a recipe. */
  recipe_imported: { source: ImportMethod; hostname?: string };
  /**
   * Parsing threw. `reason` is the raw parser message, truncated; `category`
   * is the groupable bucket it fell into.
   */
  recipe_import_failed: {
    source: ImportMethod;
    hostname?: string;
    reason: string;
    category: ImportFailureCode;
    /**
     * The Firebase Storage folder the failed input was stashed in for debugging
     * — image bytes, pasted text, or the URL that wouldn't parse (see
     * lib/failedImportCapture.ts). Absent when there was nothing to capture or
     * the capture didn't land.
     */
    debugPath?: string;
  };

  // ---- Printing --------------------------------------------------------
  // Card size, photo and duplex are the axes the clipping bug lives on, so
  // they ride along on every print event. Knowing a card overflowed is only
  // actionable alongside the configuration it overflowed in.
  /** window.print() was called. Intent, and as close to truth as the web gets. */
  print_started: {
    template: RecipePrintTemplate;
    cardSize: PrintCardSize;
    showPhoto: boolean;
    doubleSided: boolean;
    recipeCount: number;
  };
  /**
   * The browser's afterprint fired. Note this does NOT mean paper came out —
   * afterprint fires on cancel too, and no browser distinguishes them. It's
   * "they got as far as the OS dialog and dismissed it".
   */
  print_dialog_closed: { template: RecipePrintTemplate; cardSize: PrintCardSize };
  /**
   * Card content overflowed its printable box — the recurring clip/reflow
   * bug, instrumented so it's a rate rather than a hunch.
   */
  card_layout_overflow: {
    template: RecipePrintTemplate;
    cardSize: PrintCardSize;
    showPhoto: boolean;
    overflowPx: number;
  };

  /** Which card designs people actually reach for. */
  template_selected: { template: RecipePrintTemplate; premium: boolean };

  // ---- Money -----------------------------------------------------------
  /** The unlock dialog was shown — the paywall impression the funnel needs. */
  paywall_shown: { product: PurchasedProduct; template?: RecipePrintTemplate };
  purchase_started: { product: PurchasedProduct; template?: RecipePrintTemplate };
  purchase_completed: { product: PurchasedProduct; template?: RecipePrintTemplate };
  purchase_cancelled: { product: PurchasedProduct; template?: RecipePrintTemplate };
  /** Claimed via a CookPilot entitlement rather than paid for. */
  free_template_claimed: { template: RecipePrintTemplate };

  feedback_submitted: { type: FeedbackType };
};

export type AnalyticsEventName = keyof EventProps;

/** Parser messages can be long and are for our eyes; keep them bounded. */
export function truncateReason(value: unknown): string {
  const text =
    value instanceof Error ? value.message : typeof value === "string" ? value : "unknown";
  return text.slice(0, 120);
}

// The loaded PostHog singleton, or null until the deferred import resolves.
// Everything reads through this rather than a module-level `import posthog`,
// which is the whole point: posthog-js is ~220KB and used to be pulled into
// the first-load bundle of every route — including the SEO landing pages,
// which carry the organic traffic and never send anything but a pageview —
// where it competed with LCP to record events nobody needs in the first
// second. It's now dynamically imported, off the critical path (see
// `initAnalytics`), and any event fired before it lands is queued below.
let posthog: PostHog | null = null;
let loadStarted = false;

// Events that fired after `initAnalytics()` but before the posthog bundle
// finished loading — most importantly the very first `$pageview`, which the
// AnalyticsProvider sends on mount, well before an idle-scheduled import can
// resolve. Replayed in order once posthog is ready. Bounded so a burst of
// events during load can't grow it without limit; analytics is best-effort,
// and dropping the oldest few under an unusual flood is the right failure.
const MAX_PENDING_EVENTS = 50;
const pending: Array<(client: PostHog) => void> = [];

function enqueue(capture: (client: PostHog) => void): void {
  if (posthog) {
    capture(posthog);
    return;
  }
  if (!loadStarted) return; // analytics disabled this session (see initAnalytics)
  if (pending.length >= MAX_PENDING_EVENTS) pending.shift();
  pending.push(capture);
}

// Defer the import to browser idle time so 220KB of analytics never sits in
// front of first paint or interactivity. Falls back to a short timeout where
// requestIdleCallback isn't available (older Safari). The `timeout` cap means
// a page that never goes idle still loads it, just later.
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

function whenIdle(run: () => void): void {
  const idle = (window as IdleWindow).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else window.setTimeout(run, 1200);
}

/** Reads a URL flag, treating a bare `?flag` and `?flag=1` the same. */
function urlFlag(params: URLSearchParams, key: string): boolean | null {
  if (!params.has(key)) return null;
  const raw = params.get(key);
  return raw === null || raw === "" || raw === "1" || raw === "true";
}

/**
 * Boots PostHog, unless this browser is one of ours.
 *
 * Three layers keep our own traffic out, because any one of them alone
 * leaks:
 *   1. Non-production hosts never initialise at all (covers localhost and
 *      preview deploys, which is most of it).
 *   2. `?optout` on the live site sets PostHog's own persisted opt-out, so
 *      this browser stops sending anything. Survives reloads; dies if we
 *      clear site data.
 *   3. `?internal` instead tags every future event with `internal: true`,
 *      which the PostHog project's "internal and test users" filter hides.
 *      Preferable to (2) — tagged events can be un-hidden later, dropped
 *      events are gone forever.
 */
export function initAnalytics(): void {
  if (loadStarted || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !isProductionRuntime()) return;

  // From here we are committed to loading. Set the flag synchronously (before
  // the await) so events fired between now and the bundle arriving get queued
  // rather than dropped, and so a second call can't start a second import.
  loadStarted = true;
  const search = window.location.search;

  whenIdle(() => {
    void import("posthog-js").then(({ default: loaded }) => {
      bootPostHog(loaded, key, search);
    });
  });
}

/** Runs once the deferred posthog bundle has loaded: configures it, applies
    the opt-out/internal flags, then replays anything captured while waiting. */
function bootPostHog(client: PostHog, key: string, search: string): void {
  client.init(key, {
    // Same-origin proxy (see next.config.mjs). Without it, ad blockers eat a
    // slice of real traffic — disproportionately the technical users.
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // No logins, no person profiles, no PII. Usage only.
    person_profiles: "identified_only",
    // App Router handles its own navigation; see AnalyticsProvider.
    capture_pageview: false,
    // Keep the opt-out flag out of cookies, in keeping with the rest.
    opt_out_capturing_persistence_type: "localStorage",

    // Everything below is PostHog's automatic capture, and every one of them
    // defaults to ON. Left alone they produced ~60 events in a single browsing
    // session — "clicked select", "right arrow", one per DOM interaction —
    // which buries the dozen events we deliberately chose and burns the quota
    // on noise nobody will ever query. The typed map above is the whole list
    // of things worth recording; if we want a new one we add it there.
    autocapture: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    // $web_vitals / network timing. Real data, but not what this is for.
    capture_performance: false,
    // surveys.js was being fetched and polled on every page load despite us
    // having no surveys. Dead weight on a page whose whole selling point is
    // printing quickly.
    disable_surveys: true,

    // Deliberately NOT disabled: $pageleave is one event per pageview and is
    // what powers bounce rate and session duration in the Web Analytics
    // dashboard. Turning it off would quietly break those numbers.
    // capture_pageleave stays at its default.

    // Session replay is off unless enabled in project settings; this just
    // guarantees typed text is masked from the first recording if it ever is.
    session_recording: {
      maskAllInputs: true,
    },
  });

  const params = new URLSearchParams(search);

  const optOut = urlFlag(params, "optout");
  if (optOut === true) client.opt_out_capturing();
  if (optOut === false) client.opt_in_capturing();

  const internal = urlFlag(params, "internal");
  if (internal === true) client.register({ internal: true });
  if (internal === false) client.unregister("internal");

  posthog = client;

  // Replay events captured while the bundle was loading (the first pageview,
  // and any imports/purchases a fast user triggered before it landed).
  const queued = pending.splice(0, pending.length);
  for (const capture of queued) capture(client);
}

/** Records one product event. Queues until posthog loads; no-ops when
    analytics never booted (non-production, missing key, or SSR). */
export function track<K extends AnalyticsEventName>(
  name: K,
  props: EventProps[K],
): void {
  enqueue((client) => client.capture(name, props));
}

/** App Router navigations don't reload the page, so pageviews are manual. */
export function capturePageview(url: string): void {
  enqueue((client) => client.capture("$pageview", { $current_url: url }));
}
