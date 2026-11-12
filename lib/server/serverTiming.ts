/**
 * Where `/api/parse` spent its time, as a `Server-Timing` header the browser
 * reads back and puts on the import's PostHog event (lib/importTiming).
 *
 * Durations and one warm/cold flag only: nothing about the page, the cook or
 * the request. A span that runs more than once (the shared parser is asked
 * twice on some paths) is summed.
 */
export type RouteSpan = "validate" | "cookpilot" | "fetch" | "supplied";

export interface RouteTiming {
  span<T>(name: RouteSpan, work: () => Promise<T>): Promise<T>;
  header(): string;
}

export function startRouteTiming(cold: boolean, now: () => number = () => performance.now()): RouteTiming {
  const startedAt = now();
  const spans = new Map<RouteSpan, number>();
  return {
    async span(name, work) {
      const t = now();
      try {
        return await work();
      } finally {
        spans.set(name, (spans.get(name) ?? 0) + (now() - t));
      }
    },
    header() {
      const parts = [`total;dur=${Math.round(now() - startedAt)}`];
      spans.forEach((ms, name) => parts.push(`${name};dur=${Math.round(ms)}`));
      // Whether this function instance had served a request before. A cold
      // one also paid a boot this clock can't see, which shows up on the
      // browser's side as the gap between its round trip and `total`.
      parts.push(`instance;desc=${cold ? "cold" : "warm"}`);
      return parts.join(", ");
    },
  };
}
