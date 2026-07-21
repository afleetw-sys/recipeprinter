import posthog from "posthog-js";
import { isProductionRuntime } from "@/lib/appEnvironment";

/**
 * Every event RecipePrinter sends, with its required properties.
 *
 * Keeping this a closed map is the point: `track()` won't compile for an
 * event name or property that isn't declared here, so the dashboard can't
 * silently fill up with `print_done`, `printCompleted` and `print-complete`
 * as three separate things measuring the same moment.
 */
type EventProps = {
  /** A recipe made it into the app, by whichever route. */
  recipe_imported: { source: "url" | "photo" | "text" | "cookpilot" };
  /** Which card designs people actually reach for. */
  template_selected: { template: string; premium: boolean };
  /** The print dialog opened — intent, not yet success. */
  print_opened: { template: string };
  /** Paired with print_opened this gives the real drop-off rate. */
  print_completed: { template: string };
  /**
   * Card content overflowed its printable box. This is the recurring
   * clip/reflow bug — instrumented so it's a number instead of a hunch.
   */
  card_layout_overflow: { template: string; overflowPx: number };
  /** RevenueCat checkout opened. */
  purchase_started: { product: string };
  purchase_completed: { product: string };
};

export type AnalyticsEventName = keyof EventProps;

let initialized = false;

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
  if (initialized || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !isProductionRuntime()) return;

  posthog.init(key, {
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
    session_recording: {
      maskAllInputs: true,
    },
  });

  initialized = true;

  const params = new URLSearchParams(window.location.search);

  const optOut = urlFlag(params, "optout");
  if (optOut === true) posthog.opt_out_capturing();
  if (optOut === false) posthog.opt_in_capturing();

  const internal = urlFlag(params, "internal");
  if (internal === true) posthog.register({ internal: true });
  if (internal === false) posthog.unregister("internal");
}

/** Records one product event. No-ops when analytics never booted. */
export function track<K extends AnalyticsEventName>(
  name: K,
  props: EventProps[K],
): void {
  if (!initialized) return;
  posthog.capture(name, props);
}

/** App Router navigations don't reload the page, so pageviews are manual. */
export function capturePageview(url: string): void {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: url });
}
