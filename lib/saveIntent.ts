"use client";

import { sessionStore } from "@/lib/storage";

/**
 * "I pressed Save, and then you asked me to sign in."
 *
 * Pressing Save while signed out opens the sign-in dialog, and the save is
 * supposed to run itself the moment an account exists. That intent used to live
 * in a React ref on the print page, which is exactly as long-lived as the
 * document — and on every phone, signing in DESTROYS the document.
 * `signInWithCookPilotProvider` uses `signInWithRedirect` for any coarse
 * pointer or narrow screen, so Google and Apple sign-in leave the page, and the
 * cook comes back to a fresh load with the ref back at `false`. They pressed
 * Save, they made an account because we asked, they were returned signed in,
 * and nothing had been saved — with no error, because from the new page's point
 * of view nobody had ever asked for anything.
 *
 * So the intent is written down somewhere that survives the trip. Session
 * storage, not local: it belongs to this tab and this errand, and a save
 * promised on one afternoon should not fire on another.
 */
const SAVE_INTENT_KEY = "recipeprinter:save-after-signin:v1";

/**
 * How long a promise to save outlives the moment it was made.
 *
 * Session storage survives reloads, so without this an intent could sit in a
 * long-lived tab and be spent days later on whatever project happened to be
 * open — the same "silently wrote that project to an account they had declined"
 * failure the cancel path exists to prevent. A sign-in round trip is seconds;
 * half an hour is generous for a slow one, a password reset, or an app switch,
 * and short enough that nothing is saved on the strength of a forgotten press.
 */
const SAVE_INTENT_TTL_MS = 30 * 60 * 1000;

interface StoredSaveIntent {
  /** The project the press was about. A different one is not what they asked
      to save, however sure we are that they wanted to save SOMETHING. */
  projectId?: string;
  at: number;
}

/** Records that a save is waiting for an account. */
export function rememberSaveIntent(projectId?: string): void {
  sessionStore.setJson(SAVE_INTENT_KEY, { projectId, at: Date.now() } satisfies StoredSaveIntent);
}

/** Drops it — the cook walked away from the sign-in dialog, or the save ran. */
export function forgetSaveIntent(): void {
  sessionStore.remove(SAVE_INTENT_KEY);
}

/**
 * Whether the project in front of us is the one somebody asked to save, spending
 * the intent if so. One-shot on purpose: a save that has been started must not
 * be started again by the next render, the next tab focus, or the next token
 * refresh.
 */
export function takeSaveIntent(projectId: string | undefined, now = Date.now()): boolean {
  const intent = sessionStore.getJson<StoredSaveIntent>(SAVE_INTENT_KEY);
  if (!intent) return false;
  const expired = !Number.isFinite(intent.at) || now - intent.at > SAVE_INTENT_TTL_MS;
  // A stale or foreign intent is cleared rather than left to be reconsidered:
  // it will not become truer, and leaving it behind is how it eventually gets
  // spent on something nobody meant.
  if (expired || (intent.projectId && projectId && intent.projectId !== projectId)) {
    forgetSaveIntent();
    return false;
  }
  forgetSaveIntent();
  return true;
}
