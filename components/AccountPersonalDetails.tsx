"use client";

import { useState } from "react";
import { signOut, updateProfile } from "firebase/auth";
import type { User } from "firebase/auth";
import { refreshCookPilotAuthUser } from "@/components/CookPilotAuth";
import { accountInitials } from "@/components/AccountAvatarButton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { AccountIcon, ICON_SIZE, PencilIcon, SpinnerIcon } from "@/components/icons";
import { friendlyAuthError } from "@/lib/friendlyErrors";

/**
 * Identity: the same avatar the header uses, your name above your email,
 * and — right on that row, not a separate section — the two things you can
 * do about either: edit the name, or end the session. No "Account details"
 * label over any of it; an avatar beside a name and email already reads as
 * an identity card, and a heading just restated what the row already showed.
 *
 * Sign out doesn't get its own card: it isn't a plan decision (it was
 * grouped under "Plan" before, which made no sense) and it isn't
 * substantial enough on its own to justify a third card on this page next
 * to the two real ones.
 *
 * Password change isn't here: RecipePrinter and CookPilot share one
 * Firebase Auth project, so a password reset already exists on the sign-in
 * form itself (`CookPilotLoginForm`'s "Forgot password?"), and a second,
 * narrower way to do the same thing on this page was one more place for the
 * two to drift apart.
 */
export function AccountPersonalDetails({ user }: { user: User }) {
  /**
   * View by default, editable only after pressing Edit.
   *
   * A settings page opened to a live form field the moment you landed on
   * it — you clicked "Settings", not "Edit my name", and the plain view
   * answers the question this page is actually for (what does my account
   * say) without a save button sitting there daring you to touch it.
   */
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const trimmedName = displayName.trim();
  const nameUnchanged = trimmedName === (user.displayName ?? "").trim();

  function startEditingName() {
    setDisplayName(user.displayName ?? "");
    setNameError(null);
    setNameSaved(false);
    setEditingName(true);
  }

  function cancelEditingName() {
    setDisplayName(user.displayName ?? "");
    setNameError(null);
    setEditingName(false);
  }

  async function saveName() {
    if (!trimmedName || nameUnchanged) return;
    setSavingName(true);
    setNameError(null);
    try {
      await updateProfile(user, { displayName: trimmedName });
      refreshCookPilotAuthUser();
      setNameSaved(true);
      setEditingName(false);
    } catch (error) {
      setNameError(friendlyAuthError(error, "We couldn't save that name. Please try again."));
    } finally {
      setSavingName(false);
    }
  }

  const initials = accountInitials(user);

  return (
    <section className="mb-cp-7 rounded-xl border border-line bg-card p-cp-5">
      <div className="flex flex-wrap items-center justify-between gap-cp-3">
        <div className="flex min-w-0 items-center gap-cp-3">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--cp-radius-control)] bg-[var(--cp-accent)] text-cp-h2 font-bold text-[var(--cp-on-accent)]"
          >
            {initials || <AccountIcon size={ICON_SIZE.md} />}
          </span>
          <div className="min-w-0">
            {editingName ? (
              <input
                id="account-display-name"
                aria-label="Full name"
                className="field min-w-0 max-w-64"
                autoFocus
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  if (nameError) setNameError(null);
                }}
              />
            ) : (
              <div className="flex items-center gap-cp-1">
                <p className="truncate text-cp-body font-bold text-ink">
                  {user.displayName || "Not set"}
                </p>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-soft transition-colors hover:bg-[var(--cp-surface-strong)] hover:text-ink"
                  aria-label="Edit name"
                  onClick={startEditingName}
                >
                  <PencilIcon size={ICON_SIZE.sm} />
                </button>
              </div>
            )}
            <p className="truncate text-cp-small text-ink-soft">
              {user.email || "No email on file"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-cp-2">
          {editingName ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                disabled={!trimmedName || nameUnchanged || savingName}
                onClick={() => void saveName()}
              >
                {savingName ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
                Save
              </button>
              <button
                type="button"
                className="btn-ghost btn-compact"
                disabled={savingName}
                onClick={cancelEditingName}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => void signOut(getFirebaseAuth())}
            >
              Sign out
            </button>
          )}
        </div>
      </div>

      {nameError && <p className="field-error mt-cp-2" role="alert">{nameError}</p>}
      {nameSaved && !editingName && <p className="mt-cp-2 text-cp-small text-ink-soft">Saved.</p>}
    </section>
  );
}
