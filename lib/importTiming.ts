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
  /** The browser's round trip to `/api/parse`, request to parsed reply. */
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

const timings = new Map<string, ImportTiming>();

export function noteImportTiming(importId: string | undefined, fields: ImportTiming): void {
  if (!importId) return;
  timings.set(importId, { ...timings.get(importId), ...fields });
}

/** This import's timings, once: the entry is gone after. */
export function takeImportTiming(importId: string): ImportTiming {
  const found = timings.get(importId) ?? {};
  timings.delete(importId);
  return found;
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
