"use client";

import { sessionStore } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────────
// One print per document.
//
// Mobile Safari runs `window.print()` once for a given document and then does
// nothing at all for every call after it: no print sheet, no `beforeprint`, no
// `afterprint`, no error, nothing the page can read. The Print button simply
// stops working, and looks exactly the same while it does.
//
// It cost a cook their session on 2026-09-07. They imported a recipe and
// printed it, imported a second one, and then tapped Print twenty-four times
// over a minute and a half before leaving. Every tap ran the whole way to
// `window.print()` — the recording shows `document.title` being rewritten to
// the recipe name each time, which is the line right above it — and every one
// of them did nothing. `/print` → `/` → `/print` is a client-side route change,
// so all twenty-five calls landed in the same document, and a document only
// gets one.
//
// So the job here is to never make the second call. Print instead from a
// document that has not printed yet, which means a real page load.
//
// `spent` lives at module scope, and that is the whole trick: module scope is
// what makes it mean "this document". A client-side navigation carries it, a
// real page load throws it away along with the rest of the module, so there is
// no key to expire and no state to clean up.
// ─────────────────────────────────────────────────────────────────────────────

/** Has this document already had its one print? */
let spent = false;

/**
 * Whether this document is itself the retry — the one a rearm just loaded.
 *
 * Survives the load that a rearm performs (nothing at module scope does), so it
 * is the one piece here that needs storage. Without it, a browser that refuses
 * to print for some reason a fresh document doesn't fix would reload forever.
 */
const RETRY_KEY = "recipeprinter:print-rearm:v1";
/** Long enough to cover the load, short enough that a marker left behind by a
    failed navigation is not still speaking for a print attempt minutes later. */
const RETRY_TTL_MS = 60_000;

export function markPrintSpent(): void {
  spent = true;
}

export function printIsSpent(): boolean {
  return spent;
}

/**
 * Is this a browser we should get a fresh document for BEFORE it is asked to
 * print, rather than after it has refused?
 *
 * Desktop prints the same document as many times as you like, so a preemptive
 * reload there would cost a page load, a scroll position and a deck zoom to fix
 * a bug that browser does not have. `pointer: coarse` is the phones and tablets
 * where it does — not a user-agent string, which would need a new entry every
 * time someone ships a browser.
 *
 * Everything else is still covered: a browser that refuses despite this being
 * false meets the watchdog on the other side of `window.print()`, which rearms
 * reactively. This only decides who pays for the fix up front.
 */
export function preferFreshDocumentForPrint(): boolean {
  if (!spent) return false;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Claim the right to reload for a print, once.
 *
 * Refuses when this document is already the retry, because a second fresh
 * document would be the same answer to the same question. The caller shows the
 * honest message instead.
 */
export function claimPrintRearm(): boolean {
  if (isPrintRetryDocument()) return false;
  // The write may not land (private mode, storage turned off) and the reload is
  // still worth doing: without the marker the failure case is one extra reload,
  // and with no reload at all it is a dead button. So the result is ignored on
  // purpose rather than not being reported.
  sessionStore.set(RETRY_KEY, String(Date.now()));
  return true;
}

/** Called once a print has actually reached the browser, so the next one that
    fails is read as a fresh failure rather than the tail of this attempt. */
export function clearPrintRetryMarker(): void {
  // Nothing to do and nothing lost if this cannot be written: a stale marker
  // expires on its own (`RETRY_TTL_MS`).
  sessionStore.remove(RETRY_KEY);
}

function isPrintRetryDocument(): boolean {
  // Unreadable storage and no marker both mean "this is not the retry", which
  // is the safe answer either way: the worst case is one reload that does not
  // help, versus a print button that refuses to try.
  const raw = sessionStore.get(RETRY_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < RETRY_TTL_MS;
}

/**
 * The same page, asked to print the moment it arrives.
 *
 * `print=1` is the flag the page already reads to auto-print for the home
 * screen's Print button, so the fresh document lands doing exactly what the tap
 * that left the old one asked for. Every other parameter is carried through
 * unchanged — the deck is `ids`, `size` and `template`, and dropping any of
 * them would print a different thing than the one on screen.
 */
export function printAgainHref(location: { pathname: string; search: string }): string {
  const params = new URLSearchParams(location.search);
  params.set("print", "1");
  return `${location.pathname}?${params.toString()}`;
}
