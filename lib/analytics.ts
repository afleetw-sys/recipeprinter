import posthog from "posthog-js";
import { isProductionRuntime } from "@/lib/appEnvironment";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { ImportMethod } from "@/types/recipe";
import type { FeedbackType } from "@/lib/feedback";

/** What product a paywall or purchase refers to. */
type PurchasedProduct = "premium_template" | "cookbook";

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
  /** Parsing threw. `reason` is the raw parser message, truncated. */
  recipe_import_failed: { source: ImportMethod; hostname?: string; reason: string };

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
