import type { ImportMethod } from "@/types/recipe";
import { track } from "@/lib/analytics";
import { anonymousOwnerId } from "@/lib/anonymousOwner";
import { isProductionRuntime } from "@/lib/appEnvironment";
import { useLocalFunctions } from "@/lib/firebase/emulators";
import { IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";
import { localStore } from "@/lib/storage";

/**
 * The client half of the free import allowance (docs/import-meter-plan.md).
 *
 * Every free card-mode import asks CookPilot's `recipePrinterImportMeter` to
 * reserve a slot before any parser request starts, then settles it once the
 * parse succeeds or fails. When the allowance is live and the server says the
 * cook has none left, the import doesn't start. In every other case the meter
 * only ever slows an import down by its own round trip: any error, or an
 * answer slower than 5 seconds, imports normally ("fails open").
 *
 * Cookbooks never reach the meter (they have their own free size, counted in
 * the browser), and neither does a visitor this browser already knows is Pro.
 *
 * The count a cook sees ("4 of 10 free imports used") is always the server's.
 * Each answer is remembered here so the import boxes can show it without
 * asking again; `refreshImportUsage` asks when there is nothing recent.
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

/**
 * Whether this browser may talk to the meter at all. Only the real site does:
 * a local dev server, a LAN address on a phone and a Vercel preview all reach
 * the PRODUCTION backend, and an import made while testing there must not use
 * up anyone's real allowance or write a record of it (Amelia, 2026-10-10). The
 * same rule keeps analytics and RevenueCat off those hosts
 * (`isProductionRuntime`). The exception is when the callables are pointed at
 * a local stand-in (`useLocalFunctions`), where metering it is the point.
 */
export function meterReachableHere(): boolean {
  return IMPORT_METER_DEPLOYED && (isProductionRuntime() || useLocalFunctions);
}

export type MeteredMethod = "url" | "image" | "text";

/** How much of the allowance is used, as the server reports it. */
export interface ImportUsage {
  /** Imports counted in the current 30 days. */
  used: number;
  limit: number;
  /** When the 30 days end and every import comes back (ms), or null when none has been used. */
  nextFreeAt: number | null;
}

export interface MeterAnswer {
  mode: "off" | "measure" | "enforce";
  allowed: boolean;
  /** `limit` on a refusal; `off`, `pro` or `unidentified` when no allowance applies. */
  reason?: string;
  usage?: ImportUsage;
}

export type Reservation =
  | { status: "skipped" }
  | { status: "reserved"; meterMs: number; result: MeterAnswer }
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
  if (!(input.deployed ?? meterReachableHere())) return "skip";
  if (!isMeteredMethod(input.method)) return "skip";
  if (input.cookbookMode || input.clientPro || input.override) return "skip";
  return "reserve";
}

// ---- The remembered count ---------------------------------------------------

const USAGE_STORAGE_KEY = "recipeprinter:import-usage:v1";

/** The last answer the server gave this browser, and whether it was enforcing. */
export interface RememberedUsage extends ImportUsage {
  enforcing: boolean;
}

let remembered: RememberedUsage | null | undefined;
const listeners = new Set<() => void>();

function readRemembered(): RememberedUsage | null {
  if (remembered !== undefined) return remembered;
  remembered = null;
  try {
    const raw = localStore.get(USAGE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<RememberedUsage>) : null;
    if (parsed && typeof parsed.used === "number" && typeof parsed.limit === "number") {
      remembered = {
        used: parsed.used,
        limit: parsed.limit,
        nextFreeAt: typeof parsed.nextFreeAt === "number" ? parsed.nextFreeAt : null,
        enforcing: parsed.enforcing === true,
      };
    }
  } catch {
    /* An unreadable cache is no cache. */
  }
  return remembered;
}

function remember(next: RememberedUsage | null): void {
  const previous = readRemembered();
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  remembered = next;
  if (next) localStore.set(USAGE_STORAGE_KEY, JSON.stringify(next));
  else localStore.remove(USAGE_STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

/** For `useSyncExternalStore`: the remembered count, and when it changes. */
export function subscribeImportUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberedImportUsage(): RememberedUsage | null {
  return readRemembered();
}

/**
 * The server said this cook's imports aren't limited (Pro). Remembered so the
 * import boxes on pages that don't load the purchase SDK (the homepage, the
 * SEO pages) don't tell a Pro member about a free allowance.
 */
const UNLIMITED_STORAGE_KEY = "recipeprinter:import-unlimited:v1";
let unlimited: boolean | undefined;

export function importsKnownUnlimited(): boolean {
  if (unlimited === undefined) unlimited = localStore.get(UNLIMITED_STORAGE_KEY) === "true";
  return unlimited;
}

function rememberUnlimited(next: boolean): void {
  if (importsKnownUnlimited() === next) return;
  unlimited = next;
  if (next) localStore.set(UNLIMITED_STORAGE_KEY, "true");
  else localStore.remove(UNLIMITED_STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

export function resetImportUsageForTest(): void {
  remembered = undefined;
  unlimited = undefined;
  listeners.clear();
}

/**
 * The count as it stands now. The 30 days are a fixed window: they start with
 * the first import, and when they end every import comes back together. So a
 * remembered count whose reset time has passed is zero, even if the server
 * hasn't been asked since.
 */
export function usageNow(usage: ImportUsage, nowMs: number): ImportUsage {
  if (usage.nextFreeAt === null || usage.nextFreeAt > nowMs) return usage;
  return { used: 0, limit: usage.limit, nextFreeAt: null };
}

function parseUsage(record: Record<string, unknown>): ImportUsage | undefined {
  const { used, limit, nextFreeAt } = record;
  if (typeof used !== "number" || !Number.isFinite(used)) return undefined;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return undefined;
  return { used, limit, nextFreeAt: typeof nextFreeAt === "number" ? nextFreeAt : null };
}

function parseAnswer(data: unknown): MeterAnswer | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.mode !== "off" && record.mode !== "measure" && record.mode !== "enforce") return null;
  const usage = parseUsage(record);
  return {
    mode: record.mode,
    // Only an explicit `false` is a refusal. Anything else imports.
    allowed: record.allowed !== false,
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(usage ? { usage } : {}),
  };
}

/** Keeps the remembered count in step with whatever the server just said. */
function noteAnswer(answer: MeterAnswer): void {
  if (answer.usage) {
    remember({ ...answer.usage, enforcing: answer.mode === "enforce" });
    rememberUnlimited(false);
  } else if (answer.reason === "off" || answer.reason === "pro" || answer.reason === "unidentified") {
    // Off, Pro, or a caller the server can't identify: no count applies.
    remember(null);
    rememberUnlimited(answer.reason === "pro");
  }
}

// ---- Talking to the meter ---------------------------------------------------

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

/**
 * This browser's time zone, sent with every meter call so the reset lands on
 * the cook's own midnight: the banner shows a date ("Resets Nov 9"), and
 * whoever waits for that date finds their imports back from its first minute.
 */
function browserTimeZone(): { tz?: string } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz ? { tz } : {};
  } catch {
    return {};
  }
}

async function callMeter(data: Record<string, unknown>): Promise<unknown> {
  // Through `callCookPilotParser`, like `loadImageImportQuota`, so the call
  // carries App Check and `rpAnonId` the same way every parser call does.
  const { callCookPilotParser } = await import("@/lib/parser");
  return callCookPilotParser(IMPORT_METER_CALLABLE, { ...data, ...browserTimeZone() });
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
        const parsed = parseAnswer(data);
        if (!parsed) throw new Error("recipePrinterImportMeter returned an unexpected shape");
        return parsed;
      })(),
      IMPORT_METER_TIMEOUT_MS,
    );
    noteAnswer(result);
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
 * Its answer carries the count with this import in it, which is what the
 * import boxes show next.
 */
export function settleImport(importId: string, outcome: "success" | "failure"): void {
  void withTimeout(callMeter({ op: "settle", importId, outcome }), IMPORT_METER_TIMEOUT_MS).then(
    (data) => {
      const answer = parseAnswer(data);
      if (answer) noteAnswer(answer);
    },
    (err) => {
      track("import_meter_unavailable", {
        op: "settle",
        reason: err instanceof MeterTimeout ? "timeout" : "error",
      });
    },
  );
}

/**
 * Asks the server for the count without importing anything. Quiet on failure:
 * the import boxes simply keep showing what they had.
 */
export async function refreshImportUsage(): Promise<void> {
  if (!meterReachableHere()) return;
  try {
    const answer = parseAnswer(await withTimeout(callMeter({ op: "status" }), IMPORT_METER_TIMEOUT_MS));
    if (answer) noteAnswer(answer);
  } catch {
    /* Keep what we had. */
  }
}

/**
 * Whether this import must not start: the allowance is live, and either the
 * server just refused it, or the server couldn't be reached and its last
 * answer to this browser was "none left" (rule E1). The second half is what
 * makes blocking the meter's request useless to someone already at the limit,
 * without ever stopping anyone because of an outage on our side: a browser
 * that was under the limit, or has no answer on record, always imports.
 */
export function importRefused(
  reservation: Reservation,
  nowMs: number = Date.now(),
  live: boolean = IMPORT_ALLOWANCE_LIVE,
): boolean {
  if (!live) return false;
  if (reservation.status === "reserved") {
    return reservation.result.mode === "enforce" && reservation.result.allowed === false;
  }
  if (reservation.status !== "unavailable") return false;
  const last = readRemembered();
  if (!last || !last.enforcing) return false;
  const now = usageNow(last, nowMs);
  return now.used >= now.limit;
}

/**
 * Whether this browser's last answer from the server says there are no free
 * imports left right now. For a page that would otherwise send the cook off to
 * `/print` just to be refused there: it can say so where they are. The count is
 * refreshed when an import box mounts (`useImportUsage`), so this is as fresh
 * as the page load, and it is false whenever there is no enforcing answer on
 * record, so it never stops a first-time visitor.
 */
export function importsSpent(nowMs: number = Date.now(), live: boolean = IMPORT_ALLOWANCE_LIVE): boolean {
  if (!live || importsKnownUnlimited()) return false;
  const last = readRemembered();
  if (!last || !last.enforcing) return false;
  const now = usageNow(last, nowMs);
  return now.used >= now.limit;
}

const refusalListeners = new Set<() => void>();

/** The free-import banner listens here so it can open the upgrade dialog. */
export function subscribeImportRefusal(listener: () => void): () => void {
  refusalListeners.add(listener);
  return () => refusalListeners.delete(listener);
}

/**
 * For a page that hands an import off to `/print` (the homepage, the SEO
 * capture blocks). When the cook is out of free imports, the upgrade dialog
 * opens where they are and this answers true: the caller then does nothing
 * else, instead of walking them to an empty print page to be refused there
 * (Amelia, 2026-10-10). The dialog is opened by the free-import banner on
 * that page; with no banner mounted to open it, this answers false and the
 * handoff goes ahead as before, to be refused on `/print`.
 */
export function refuseImportIfSpent(): boolean {
  if (!importsSpent() || refusalListeners.size === 0) return false;
  refusalListeners.forEach((listener) => listener());
  return true;
}

/** How long the meter held this import up, for the import events. */
export function meterMsOf(reservation: Reservation): { meterMs?: number } {
  return reservation.status === "skipped" ? {} : { meterMs: reservation.meterMs };
}

/** How many imports were already used when this one began, for `recipe_imported`. */
export function meterImportedFields(reservation: Reservation): { meter_used?: number; meter_limit?: number } {
  if (reservation.status !== "reserved" || !reservation.result.usage) return {};
  return { meter_used: reservation.result.usage.used, meter_limit: reservation.result.usage.limit };
}
