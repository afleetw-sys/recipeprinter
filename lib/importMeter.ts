import type { ImportMethod } from "@/types/recipe";
import { track } from "@/lib/analytics";
import { anonymousOwnerId } from "@/lib/anonymousOwner";

/**
 * The client half of the free import meter (docs/import-meter-plan.md).
 *
 * Every free card-mode import asks CookPilot's `recipePrinterImportMeter` to
 * reserve a slot before any parser request starts, then settles it once the
 * parse succeeds or fails. The meter only ever slows an import down by its own
 * round trip: any error, or an answer slower than 5 seconds, imports normally
 * ("fails open"). This rollout only measures, so the answer never stops an
 * import either way.
 *
 * Cookbooks never reach the meter (they have their own free size, counted in
 * the browser), and neither does a visitor this browser already knows is Pro.
 */

export const IMPORT_METER_CALLABLE = "recipePrinterImportMeter";
export const IMPORT_METER_TIMEOUT_MS = 5_000;

/**
 * Whether the client calls `recipePrinterImportMeter` at all. It was false
 * until the callable was deployed to CookPilot and checked on 2026-10-10
 * (`scripts/check-import-meter.mjs`), because calling a function that doesn't
 * exist would cost every free import a failed request. The server's `mode` now
 * decides whether anything is recorded, with no RecipePrinter deploy. Setting
 * this back to false is the client-side rollback (docs/import-meter.md).
 */
export const IMPORT_METER_DEPLOYED = true;

export type MeteredMethod = "url" | "image" | "text";

export interface ReserveResult {
  mode: "off" | "measure" | "enforce";
  allowed: boolean;
  reason?: string;
  /** Counted imports in the previous 30 days, before this one. */
  used30d?: number;
  wouldBlock?: { 5?: boolean; 10?: boolean };
  subjectKind?: "browser" | "account";
}

export type Reservation =
  | { status: "skipped" }
  | { status: "reserved"; meterMs: number; result: ReserveResult }
  | { status: "unavailable"; meterMs: number; reason: "timeout" | "error" };

export const SKIPPED: Reservation = { status: "skipped" };

function isMeteredMethod(method: ImportMethod): method is MeteredMethod {
  return method === "url" || method === "image" || method === "text";
}

/**
 * Whether this import asks the meter at all.
 *
 * `override` is the caller saying "this lands in a cookbook" before the book
 * exists: the homepage's Cookbook tab replays its import in the same tick it
 * starts building the book, so `cookbookMode` is still false when the import
 * starts (see the pending-import effect in app/print/page.tsx).
 */
export function meterGateFor(input: {
  method: ImportMethod;
  cookbookMode: boolean;
  clientPro: boolean;
  override?: boolean;
  deployed?: boolean;
}): "skip" | "reserve" {
  if (!(input.deployed ?? IMPORT_METER_DEPLOYED)) return "skip";
  if (!isMeteredMethod(input.method)) return "skip";
  if (input.cookbookMode || input.clientPro || input.override) return "skip";
  return "reserve";
}

class MeterTimeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MeterTimeout()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function callMeter(data: Record<string, unknown>): Promise<unknown> {
  // Through `callCookPilotParser`, like `loadImageImportQuota`, so the call
  // carries App Check and `rpAnonId` the same way every parser call does.
  const { callCookPilotParser } = await import("@/lib/parser");
  return callCookPilotParser(IMPORT_METER_CALLABLE, data);
}

function parseReserveResult(data: unknown): ReserveResult | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.mode !== "off" && record.mode !== "measure" && record.mode !== "enforce") return null;
  if (typeof record.allowed !== "boolean") return null;
  const wouldBlock =
    record.wouldBlock && typeof record.wouldBlock === "object"
      ? (record.wouldBlock as Record<string, unknown>)
      : null;
  return {
    mode: record.mode,
    allowed: record.allowed,
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(typeof record.used30d === "number" && Number.isFinite(record.used30d)
      ? { used30d: record.used30d }
      : {}),
    ...(wouldBlock
      ? {
          wouldBlock: {
            ...(typeof wouldBlock[5] === "boolean" ? { 5: wouldBlock[5] } : {}),
            ...(typeof wouldBlock[10] === "boolean" ? { 10: wouldBlock[10] } : {}),
          },
        }
      : {}),
    ...(record.subjectKind === "browser" || record.subjectKind === "account"
      ? { subjectKind: record.subjectKind }
      : {}),
  };
}

/**
 * A short, per-browser hash of what was imported, so re-importing the same
 * link or text within the window counts once (decision D2). Salted with this
 * browser's own id, so the server can't match it against a known recipe page.
 * Absent where `crypto.subtle` isn't (an insecure origin): that import is
 * simply never deduped.
 */
export async function dedupeKeyFor(input: string): Promise<string | undefined> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || !input) return undefined;
    const bytes = new TextEncoder().encode(`${anonymousOwnerId()}\n${input}`);
    const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
    return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

/** Pasted text, normalized enough that a re-paste matches. */
export function normalizedTextForDedupe(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Reserves this import with the meter. Never throws and never takes longer
 * than `IMPORT_METER_TIMEOUT_MS`: a missing, slow or broken meter comes back
 * as "unavailable" and the import goes ahead.
 */
export async function reserveImport(input: {
  importId: string;
  method: MeteredMethod;
  dedupeInput?: string;
}): Promise<Reservation> {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      (async () => {
        const dedupeKey = input.dedupeInput ? await dedupeKeyFor(input.dedupeInput) : undefined;
        const data = await callMeter({
          op: "reserve",
          importId: input.importId,
          method: input.method,
          ...(dedupeKey ? { dedupeKey } : {}),
        });
        const parsed = parseReserveResult(data);
        if (!parsed) throw new Error("recipePrinterImportMeter returned an unexpected shape");
        return parsed;
      })(),
      IMPORT_METER_TIMEOUT_MS,
    );
    return { status: "reserved", meterMs: Date.now() - startedAt, result };
  } catch (err) {
    const reason = err instanceof MeterTimeout ? "timeout" : "error";
    track("import_meter_unavailable", { op: "reserve", reason });
    return { status: "unavailable", meterMs: Date.now() - startedAt, reason };
  }
}

/**
 * Tells the meter how the import ended. Fire-and-forget: the cook never waits
 * on it, and a lost settle only leaves a pending entry that expires on its own.
 */
export function settleImport(importId: string, outcome: "success" | "failure"): void {
  void withTimeout(callMeter({ op: "settle", importId, outcome }), IMPORT_METER_TIMEOUT_MS).catch(
    (err) => {
      track("import_meter_unavailable", {
        op: "settle",
        reason: err instanceof MeterTimeout ? "timeout" : "error",
      });
    },
  );
}

/** How long the meter held this import up, for the import events. */
export function meterMsOf(reservation: Reservation): { meterMs?: number } {
  return reservation.status === "skipped" ? {} : { meterMs: reservation.meterMs };
}

/** What the meter said about this import, for `recipe_imported`. */
export function meterImportedFields(reservation: Reservation): {
  meter_used_30d?: number;
  meter_would_block_5?: boolean;
  meter_would_block_10?: boolean;
  meter_subject_kind?: "browser" | "account";
} {
  if (reservation.status !== "reserved") return {};
  const { used30d, wouldBlock, subjectKind } = reservation.result;
  return {
    ...(used30d !== undefined ? { meter_used_30d: used30d } : {}),
    ...(wouldBlock?.[5] !== undefined ? { meter_would_block_5: wouldBlock[5] } : {}),
    ...(wouldBlock?.[10] !== undefined ? { meter_would_block_10: wouldBlock[10] } : {}),
    ...(subjectKind ? { meter_subject_kind: subjectKind } : {}),
  };
}
