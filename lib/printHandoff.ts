import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";
import { CURRENT_PRINT_JOB_STORAGE_KEY, QUEUE_STORAGE_KEY } from "@/lib/queue";
import { PROJECT_META_STORAGE_KEY, type ProjectMeta } from "@/lib/project";
import { PRINT_SETTINGS_STORAGE_KEY } from "@/lib/printSettings";
import { localStore, sessionStore } from "@/lib/storage";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import type { QueueItem } from "@/types/recipe";

/**
 * Printing in Safari for a cook whose own browser cannot print.
 *
 * The Google app's in-app browser on iOS replaces `window.print()` with a
 * hand-off to the app that throws, and nothing else reaches a print sheet from
 * inside it (tested on a real iPhone, 2026-10-08, with /print-check: frame
 * print and borrowed native print do nothing). What does work is opening the
 * page in Safari with an `x-safari-https://` link, where the first print of a
 * new tab opens the sheet without a tap.
 *
 * Safari cannot see the app's storage, so the deck travels inside the link:
 * the recipes, the print job, the book's settings and the card settings,
 * compressed, after the `#`. A fragment never reaches a server, so the recipes
 * go from the phone to the phone. Photos only this browser holds (`blob:`
 * URLs, which die with the document) go as shrunken JPEGs inside it, prepared
 * ahead of time because the link has to open inside the tap.
 *
 * Arriving, `seedPrintHandoff` writes it all back into the new tab's storage
 * before the print page reads it, so Safari lays out and prints the same cards
 * from the same code, not a copy of them.
 */

export const HANDOFF_PARAM = "handoff";
/** Where an arriving tab keeps the print pass until it is checked. */
const PRINT_PASS_STORAGE_KEY = "recipeprinter:print-pass:v1";
const FRAGMENT_PREFIX = "#rp=";

export interface PrintHandoff {
  v: 1;
  items: QueueItem[];
  meta: ProjectMeta;
  /** The raw print-settings value, exactly as this browser stored it. */
  settings: string | null;
  /** A subscriber's signed print pass (lib/server/printPass), so Safari prints
      their deck as theirs rather than as a free one. */
  pass?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The deck as it is on screen, with every local photo swapped for the copy
 * `prepareLocalPhotos` made. A `blob:` URL with no copy is dropped rather than
 * sent: it would be a dead link in Safari either way.
 */
export function packPrintHandoff(
  items: readonly QueueItem[],
  meta: ProjectMeta,
  localPhotos: ReadonlyMap<string, string>,
  pass: string | null = null,
): PrintHandoff {
  const swap = (_key: string, value: unknown) => {
    if (typeof value !== "string" || !value.startsWith("blob:")) return value;
    return localPhotos.get(value) ?? undefined;
  };
  const portable = JSON.parse(
    JSON.stringify(
      items.map(({ localPhotoId: _held, ...item }) => item),
      swap,
    ),
  ) as QueueItem[];
  return {
    v: 1,
    items: portable,
    meta: JSON.parse(JSON.stringify(meta, swap)) as ProjectMeta,
    settings: localStore.get(PRINT_SETTINGS_STORAGE_KEY),
    ...(pass ? { pass } : {}),
  };
}

/** The Safari link that opens /print with this deck and prints it. */
export function printHandoffUrl(handoff: PrintHandoff, origin: string): string {
  const host = new URL(origin).host;
  const packed = toBase64Url(zlibSync(strToU8(JSON.stringify(handoff)), { level: 9 }));
  return `x-safari-https://${host}/print?print=1&${HANDOFF_PARAM}=1${FRAGMENT_PREFIX}${packed}`;
}

/** Leaves for Safari. Its own function so a test can stand in for navigation. */
export function openInSafari(url: string): void {
  window.location.href = url;
}

/** Reads a hand-off out of a link, or null for any other link. */
export function readPrintHandoff(hash: string): PrintHandoff | null {
  if (!hash.startsWith(FRAGMENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      strFromU8(unzlibSync(fromBase64Url(hash.slice(FRAGMENT_PREFIX.length)))),
    ) as Partial<PrintHandoff>;
    if (parsed.v !== 1 || !Array.isArray(parsed.items) || !parsed.meta) return null;
    return parsed as PrintHandoff;
  } catch {
    return null;
  }
}

/**
 * Puts a hand-off's deck where the print page will find it, and takes the
 * deck back out of the address bar. Runs before the page reads storage (see
 * the call at the top of app/print/page.tsx). Returns whether there was one.
 */
export function seedPrintHandoff(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(HANDOFF_PARAM) !== "1") return false;
  const handoff = readPrintHandoff(window.location.hash);
  if (!handoff) return false;
  sessionStore.set(QUEUE_STORAGE_KEY, JSON.stringify(handoff.items));
  sessionStore.set(
    CURRENT_PRINT_JOB_STORAGE_KEY,
    JSON.stringify({ ids: handoff.items.map((item) => item.id) }),
  );
  sessionStore.set(PROJECT_META_STORAGE_KEY, JSON.stringify(handoff.meta));
  if (handoff.settings) localStore.set(PRINT_SETTINGS_STORAGE_KEY, handoff.settings);
  if (handoff.pass) sessionStore.set(PRINT_PASS_STORAGE_KEY, handoff.pass);
  // The recipes have no business in the address bar, history or a shared link.
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  return true;
}

/** Longest edge of a local photo carried in the link. Enough for a card. */
const CARRIED_PHOTO_EDGE = 1400;

/**
 * Small JPEG copies of every `blob:` photo in the deck, keyed by its URL.
 *
 * Done ahead of the tap because the Safari link has to open inside it, and
 * reading a photo is not synchronous. A photo that fails is left out.
 */
export async function prepareLocalPhotos(
  items: readonly QueueItem[],
  meta: ProjectMeta,
  already: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const urls = new Set<string>();
  JSON.stringify([items, meta], (_key, value: unknown) => {
    if (typeof value === "string" && value.startsWith("blob:")) urls.add(value);
    return value;
  });
  const prepared = new Map<string, string>();
  for (const url of Array.from(urls)) {
    const done = already.get(url);
    if (done) {
      prepared.set(url, done);
      continue;
    }
    try {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const scale = Math.min(1, CARRIED_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      prepared.set(url, canvas.toDataURL("image/jpeg", 0.82));
    } catch {
      // Leave it out; the card prints without that photo rather than not at all.
    }
  }
  return prepared;
}

// ── Print passes ─────────────────────────────────────────────────────────────

/**
 * A pass for this signed-in subscriber, or null when they hold nothing a pass
 * would carry (or are not signed in, or the server cannot say right now).
 */
export async function requestPrintPass(): Promise<string | null> {
  try {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const idToken = await getFirebaseAuth().currentUser?.getIdToken();
    if (!idToken) return null;
    const response = await fetch("/api/print-pass", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "issue" }),
    });
    if (!response.ok) return null;
    const { pass } = (await response.json()) as { pass?: string | null };
    return pass ?? null;
  } catch {
    return null;
  }
}

/** The pass this tab arrived with, if any. */
export function arrivedPrintPass(): string | null {
  return sessionStore.get(PRINT_PASS_STORAGE_KEY);
}

/**
 * What a pass is good for, as the entitlements RevenueCat would report, or
 * null when the server does not vouch for it (forged, expired, or unreachable).
 */
export async function verifyPrintPass(pass: string): Promise<CustomerInfo | null> {
  try {
    const response = await fetch("/api/print-pass", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", pass }),
    });
    if (!response.ok) return null;
    const { ent, exp } = (await response.json()) as { ent: string[]; exp: number };
    const entries = ent.map((identifier) => [
      identifier,
      { identifier, isActive: true, willRenew: false, expirationDate: new Date(exp) },
    ]);
    const map = Object.fromEntries(entries);
    return { entitlements: { active: map, all: map } } as unknown as CustomerInfo;
  } catch {
    return null;
  }
}

/** `base` with a verified pass's entitlements added, while the pass lasts. */
export function withPrintPass(base: CustomerInfo | null, pass: CustomerInfo | null, nowMs: number): CustomerInfo | null {
  if (!pass) return base;
  const live = Object.fromEntries(
    Object.entries(pass.entitlements.active).filter(
      ([, entitlement]) => (entitlement.expirationDate?.getTime() ?? 0) > nowMs,
    ),
  );
  if (Object.keys(live).length === 0) return base;
  if (!base) return { entitlements: { active: live, all: live } } as unknown as CustomerInfo;
  return {
    ...base,
    entitlements: {
      ...base.entitlements,
      active: { ...live, ...base.entitlements.active },
      all: { ...live, ...base.entitlements.all },
    },
  } as CustomerInfo;
}
