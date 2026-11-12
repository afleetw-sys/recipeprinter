/**
 * Where a link import's time went, gathered while it runs and put on its
 * `recipe_imported` / `recipe_import_failed` event (audit F1, 2026-11-12: a
 * cook's first link import of a visit took a median 4.5 s against 0.8 s for
 * later ones, and nothing said where the difference went).
 *
 * Kept per import id because the parser runs below the queue, which owns the
 * events. Only durations in ms and one cold/warm flag: nothing about the
 * recipe, the page or the cook. The meter's share is on the event already
 * (`meterMs` and its stages, lib/importMeter).
 */
export interface ImportTiming {
  /** The browser's round trip to `/api/parse`, request sent to reply headers in. */
  routeMs?: number;
  /** The route's own clock, from its `Server-Timing` header. `routeMs` minus
      this is the network and any function boot. */
  routeServerMs?: number;
  /** The route checking the address is public (a DNS lookup). */
  routeValidateMs?: number;
  /** The route waiting on CookPilot's parser for the URL. */
  routeCookPilotMs?: number;
  /** The route fetching the page itself, after CookPilot didn't answer. */
  routeFetchMs?: number;
  /** CookPilot reading the HTML the route fetched. */
  routeSuppliedMs?: number;
  /** The route's function instance served its first request with this one. */
  routeCold?: boolean;
  /** CookPilot's callable, when the route's answer sent the import there. */
  fallbackMs?: number;
}

/** Open imports only. A field noted for an id that isn't open is dropped. */
const timings = new Map<string, ImportTiming>();

/**
 * Starts collecting for this import's parse. Only an open import takes notes,
 * so a request still running after its import was given up on (the 75 s
 * deadline) can't leave timings behind, or slip them onto a later event.
 */
export function openImportTiming(importId: string): void {
  timings.set(importId, {});
}

export function noteImportTiming(importId: string | undefined, fields: ImportTiming): void {
  if (!importId) return;
  const open = timings.get(importId);
  if (!open) return;
  timings.set(importId, { ...open, ...fields });
}

/** This import's timings, once, and it stops taking notes. */
export function takeImportTiming(importId: string): ImportTiming {
  const found = timings.get(importId) ?? {};
  timings.delete(importId);
  return found;
}

let importsThisPage = 0;

/**
 * 1 for the first import this page load began, 2 for the next, and so on.
 * What makes an import "first" is per page load (the Firebase code, the App
 * Check token, the browser's connections), and a PostHog session can span
 * reloads or split on a long pause, so the events carry it directly.
 */
export function nextImportIndex(): number {
  importsThisPage += 1;
  return importsThisPage;
}

const SPAN_FIELDS = {
  total: "routeServerMs",
  validate: "routeValidateMs",
  cookpilot: "routeCookPilotMs",
  fetch: "routeFetchMs",
  supplied: "routeSuppliedMs",
} as const satisfies Record<string, keyof ImportTiming>;

/** The route's `Server-Timing` header (lib/server/serverTiming) as fields. Anything else in it is ignored. */
export function routeTimingFrom(header: string | null): ImportTiming {
  const out: ImportTiming = {};
  if (!header) return out;
  for (const entry of header.split(",")) {
    const [rawName, ...params] = entry.trim().split(";");
    const name = rawName.trim();
    const values = new Map(
      params.map((param) => {
        const [key, value = ""] = param.trim().split("=");
        return [key.trim(), value.trim().replace(/^"|"$/g, "")] as const;
      }),
    );
    if (name === "instance") {
      const desc = values.get("desc");
      if (desc === "cold" || desc === "warm") out.routeCold = desc === "cold";
      continue;
    }
    const field = SPAN_FIELDS[name as keyof typeof SPAN_FIELDS];
    const ms = Number(values.get("dur"));
    if (field && Number.isFinite(ms) && ms >= 0) out[field] = Math.round(ms);
  }
  return out;
}
