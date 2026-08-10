import type { PostHog } from "posthog-js";
import { isProductionRuntime } from "@/lib/appEnvironment";
import {
  type Attribution,
  type AttributionInput,
  categoryOf,
  isAiTraffic,
  isExternalSource,
  resolveAttribution,
} from "@/lib/attribution";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { CookbookPresetId, ImportMethod } from "@/types/recipe";
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
    /** The cookbook print-format preset, when exporting a cookbook. */
    cookbookPreset?: CookbookPresetId;
  };
  /**
   * The browser's afterprint fired. Note this does NOT mean paper came out —
   * afterprint fires on cancel too, and no browser distinguishes them. It's
   * "they got as far as the OS dialog and dismissed it".
   */
  print_dialog_closed: {
    template: RecipePrintTemplate;
    cardSize: PrintCardSize;
    cookbookPreset?: CookbookPresetId;
  };
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
  /** The unlock dialog was shown — the paywall impression the funnel needs.
      `price` is the exact displayed price (e.g. "$19.99") so the funnel can be
      segmented by what people actually saw. */
  paywall_shown: { product: PurchasedProduct; template?: RecipePrintTemplate; price?: string };
  /** The unlock dialog was closed WITHOUT starting checkout — i.e. the cook saw
      the price and backed out. `paywall_shown` minus this is the answer to "how
      many bail when they see it's $19.99". */
  paywall_dismissed: { product: PurchasedProduct; template?: RecipePrintTemplate; price?: string };
  purchase_started: { product: PurchasedProduct; template?: RecipePrintTemplate };
  purchase_completed: { product: PurchasedProduct; template?: RecipePrintTemplate };
  purchase_cancelled: { product: PurchasedProduct; template?: RecipePrintTemplate };
  /** Claimed via a CookPilot entitlement rather than paid for. */
  free_template_claimed: { template: RecipePrintTemplate };

  // ---- Cookbook export format ------------------------------------------
  /** The print-format preset picker was used to choose a format. */
  cookbook_preset_selected: { preset: CookbookPresetId };
  /** The post-export "Print your cookbook" screen was shown. */
  cookbook_print_options_shown: { preset: CookbookPresetId };
  /** A recommended print-shop link was opened from the export screen. */
  cookbook_printer_clicked: { printer: string; preset?: CookbookPresetId };
  /** A signed-out cookbook owner clicked a "back up your purchase with a free
      account" nudge. `source` distinguishes where the nudge lived (persistent
      editor banner today) so we can see which surface converts guests. */
  protect_prompt_clicked: { source: string };
  /** The "make it a cookbook" offer (first place the price is shown). `price`
      is the displayed per-cookbook price so the offer→dismiss funnel is
      segmentable by price; `recipeCount` = how many recipes they had at the
      time (does library size predict cookbook interest?). */
  cookbook_welcome_shown: { price?: string; recipeCount: number };
  /** Entered the cookbook workspace (built the book). `recipeCount` = library
      size at build time, for segmenting who actually builds cookbooks;
      `template` = the theme the book opened on (rotated premium default or a
      theme the cook had already chosen), so we can see which cookbook themes
      get used. */
  cookbook_workspace_entered: { recipeCount: number; template: RecipePrintTemplate };
  /** The offer dialog was dismissed without building — the price-reveal back-out
      at the offer stage (the export paywall has its own `paywall_dismissed`). */
  cookbook_onboarding_dismissed: { price?: string };
  /** Switched back from a cookbook to plain recipe cards — how sticky the mode
      is (build one, then bail?). `recipeCount` for consistent segmentation. */
  cookbook_exited: { recipeCount: number };
  cookbook_cover_layout_selected: { layout: "photo" | "collage" | "typographic" };
  cookbook_front_matter_enabled: { kind: "dedication" | "introduction" };
  cookbook_section_opener_toggled: { enabled: boolean };
  cookbook_section_created_from_selection: { count: number };
  cookbook_section_selection_moved: { count: number };
  cookbook_ready_shown: { freshPurchase: boolean };
  relayout_started: {};
  relayout_method_selected: { method: "suggested" };
  relayout_previewed: { sectionCount: number; uncategorizedCount: number };
  relayout_applied: { sectionCount: number };
  relayout_cancelled: {};
  section_created: { source: "organize" };
  section_opener_toggled: { enabled: boolean; source: "organize" };

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

  // Capture the landing signals NOW, synchronously, before anything can
  // navigate. posthog itself loads on idle (below) and by then this is still
  // the same document, but reading them here makes "these are the values from
  // the very first paint" a guarantee rather than a timing coincidence.
  const attribution: AttributionInput = {
    href: window.location.href,
    referrer: document.referrer,
  };

  whenIdle(() => {
    void import("posthog-js").then(({ default: loaded }) => {
      bootPostHog(loaded, key, search, attribution);
    });
  });
}

/** Runs once the deferred posthog bundle has loaded: configures it, applies
    the opt-out/internal flags, then replays anything captured while waiting. */
function bootPostHog(
  client: PostHog,
  key: string,
  search: string,
  attribution: AttributionInput,
): void {
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

    // $pageleave is one event per pageview and is what powers bounce rate and
    // session duration in the Web Analytics dashboard. It must be forced ON:
    // posthog-js defaults capture_pageleave to "if_capture_pageview", and we
    // send pageviews manually with capture_pageview:false — so at the default
    // it never fires, which is exactly the "$pageleave not detected" warning
    // PostHog shows. Setting it true captures pageleave independently.
    capture_pageleave: true,

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

  // Register attribution BEFORE flushing the queue so the very first replayed
  // $pageview already carries the first_*/latest_* super properties.
  applyTrafficAttribution(client, attribution);

  posthog = client;

  // Replay events captured while the bundle was loading (the first pageview,
  // and any imports/purchases a fast user triggered before it landed).
  const queued = pending.splice(0, pending.length);
  for (const capture of queued) capture(client);
}

// Session flag: set for the life of a tab. Its absence is how we tell a fresh
// session (new tab / first load) from an in-tab reload, so "latest touch" and
// the Landing Page event fire once per session, not once per page load.
//
// sessionStorage is per-tab by design, so "session" here means "tab": opening
// the site in a second tab is a second Landing Page event with its own
// referrer/landing. That's intentional — each tab genuinely is a distinct
// entry — and it's the granularity PostHog's own $pageleave/session model uses
// too. (It also means a duplicated tab inherits nothing, which is what we want:
// the copy re-attributes from its own URL.)
const LANDING_SESSION_FLAG = "rp_attribution_session";

// The attribution resolved once at boot, kept so a later identify() can copy
// it onto the person without re-reading the URL (which SPA navigation has by
// then changed).
let resolvedAttribution: Attribution | null = null;

// The last distinct id we identified, so repeated auth callbacks (the auth
// hook mounts in several components) don't re-identify on every render.
let lastIdentifiedId: string | null = null;

/** True exactly once per browser session; marks the session as seen. */
function beginLandingSession(): boolean {
  try {
    if (window.sessionStorage.getItem(LANDING_SESSION_FLAG)) return false;
    window.sessionStorage.setItem(LANDING_SESSION_FLAG, "1");
    return true;
  } catch {
    // Storage blocked (private mode / cookie-less). Treat every load as a new
    // session: at worst we register latest-touch and a Landing Page event once
    // per page rather than once per session, which is a tolerable over-count.
    return true;
  }
}

/**
 * The whole attribution side effect, in one place (requirements 1–5):
 *   - first_* super properties via `register_once`, never overwritten.
 *   - the rolling "latest known source" fields (`traffic_source`,
 *     `traffic_source_category`, `latest_*`), which advance each new session
 *     but ONLY on a real external source (see below).
 *   - a "Landing Page" event once per session.
 *
 * Super properties (not `$set` person properties) are deliberate: the project
 * runs `person_profiles: "identified_only"` and most visitors are anonymous, so
 * `$set` would be dropped for them. Super properties attach to EVERY event —
 * anonymous or identified — which is exactly "attach to all future events".
 */
function applyTrafficAttribution(client: PostHog, input: AttributionInput): void {
  const a = resolveAttribution(input);
  resolvedAttribution = a;

  const category = categoryOf(a.source);
  // The rolling "latest known source" fields, kept in one object so the
  // register_once seed, the register advance, and identify() all agree.
  const latest = {
    traffic_source: a.source,
    traffic_source_category: category,
    is_ai_traffic: isAiTraffic(a.source),
    latest_traffic_source: a.source,
    latest_referrer: a.referrer,
    latest_landing_page: a.landingPage,
  };

  // First-touch, plus a one-time seed of the rolling fields so a visitor who
  // only ever arrives direct still has a `traffic_source`. register_once never
  // overwrites, so real external sessions still advance the rolling fields via
  // register() below.
  client.register_once({
    first_traffic_source: a.source,
    first_traffic_source_category: category,
    first_referrer: a.referrer,
    first_landing_page: a.landingPage,
    first_utm_source: a.utmSource,
    first_utm_medium: a.utmMedium,
    first_utm_campaign: a.utmCampaign,
    first_gclid: a.gclid,
    first_fbclid: a.fbclid,
    ...latest,
  });

  // Latest-touch and the Landing Page event are per-session, not per-pageview.
  if (!beginLandingSession()) return;

  // Advance the rolling source only on a real external source: a new Direct
  // session (including an internal recipeprinter.com referrer, which resolves
  // to Direct) must not clobber the last known source the person came from.
  if (isExternalSource(a.source)) client.register(latest);

  // Captured directly (not through the typed `track()` map) because it's an
  // internal boot event fired only from here. It records this session's ACTUAL
  // source — Direct included — independent of the sticky rolling fields above.
  client.capture("Landing Page", {
    landing_page: a.landingPage,
    traffic_source: a.source,
    traffic_source_category: category,
    referrer: a.referrer,
    utm_source: a.utmSource,
    utm_medium: a.utmMedium,
    utm_campaign: a.utmCampaign,
    gclid: a.gclid,
    fbclid: a.fbclid,
  });
}

/** Records one product event. Queues until posthog loads; no-ops when
    analytics never booted (non-production, missing key, or SSR). */
export function track<K extends AnalyticsEventName>(
  name: K,
  props: EventProps[K],
): void {
  enqueue((client) => client.capture(name, props));
}

/**
 * Ties this browser's events to a stable person (the CookPilot account uid) and
 * copies the attribution onto the PostHog PERSON — first-touch via `$set_once`
 * (never overwritten), latest-touch via `$set`. Super properties already put
 * attribution on every event; this additionally makes it queryable per-person,
 * which is what "person properties when a user is identified" needs given the
 * project runs `person_profiles: "identified_only"` (no anonymous profiles).
 *
 * Idempotent per id and safe to call from an auth callback that fires on every
 * mount — repeated calls with the same uid are ignored.
 */
export function identifyUser(distinctId: string): void {
  if (!distinctId || distinctId === lastIdentifiedId) return;
  lastIdentifiedId = distinctId;
  enqueue((client) => {
    const a = resolvedAttribution;
    if (!a) {
      client.identify(distinctId);
      return;
    }
    const category = categoryOf(a.source);
    const latest = {
      traffic_source: a.source,
      traffic_source_category: category,
      is_ai_traffic: isAiTraffic(a.source),
      latest_traffic_source: a.source,
      latest_referrer: a.referrer,
      latest_landing_page: a.landingPage,
    };
    client.identify(
      distinctId,
      // $set — advance latest only on a real external source, mirroring the
      // super-property rule so a Direct session can't clobber the person's
      // last known source.
      isExternalSource(a.source) ? latest : undefined,
      // $set_once — first-touch, plus a one-time seed of the rolling fields.
      {
        first_traffic_source: a.source,
        first_traffic_source_category: category,
        first_referrer: a.referrer,
        first_landing_page: a.landingPage,
        first_utm_source: a.utmSource,
        first_utm_medium: a.utmMedium,
        first_utm_campaign: a.utmCampaign,
        first_gclid: a.gclid,
        first_fbclid: a.fbclid,
        ...latest,
      },
    );
  });
}

/** App Router navigations don't reload the page, so pageviews are manual. */
export function capturePageview(url: string): void {
  enqueue((client) => client.capture("$pageview", { $current_url: url }));
}
