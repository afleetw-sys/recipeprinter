"use client";

import { useState } from "react";
import { updateProfile } from "firebase/auth";
import type { User } from "firebase/auth";
import { refreshCookPilotAuthUser } from "@/components/CookPilotAuth";
import { ICON_SIZE, SpinnerIcon } from "@/components/icons";
import { friendlyAuthError } from "@/lib/friendlyErrors";

/**
 * Email (read-only) and full name, editable in place — the two things
 * "Personal details" means for an account with no other profile fields to
 * speak of. Password change isn't here: RecipePrinter and CookPilot share
 * one Firebase Auth project, so a password reset already exists on the
 * sign-in form itself (`CookPilotLoginForm`'s "Forgot password?"), and a
 * second, narrower way to do the same thing on this page was one more place
 * for the two to drift apart.
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

  return (
    <section className="mb-cp-7 rounded-xl border border-line bg-card p-cp-5">
      <div className="flex flex-wrap items-center justify-between gap-cp-3">
        <h2 className="text-cp-small font-bold text-ink">Personal details</h2>
      </div>

      <div className="mt-cp-3">
        <span className="field-label">Email</span>
        <p className="text-cp-body text-ink-soft">{user.email || "No email on file"}</p>
      </div>

      <div className="mt-cp-3">
        <span className="field-label">Full name</span>
        {editingName ? (
          <>
            <div className="flex flex-wrap items-start gap-cp-2">
              <input
                id="account-display-name"
                aria-label="Full name"
                className="field min-w-48 flex-1"
                autoFocus
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  if (nameError) setNameError(null);
                }}
              />
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
            </div>
            {nameError && <p className="field-error" role="alert">{nameError}</p>}
          </>
        ) : (
          // Edit sits right next to the name it edits, not flung to the far
          // edge of the card by `justify-between` — the row is only as wide
          // as its content.
          <div className="flex items-center gap-cp-3">
            <p className="text-cp-body text-ink-soft">{user.displayName || "Not set"}</p>
            <button type="button" className="btn-ghost btn-compact" onClick={startEditingName}>
              Edit
            </button>
          </div>
        )}
        {nameSaved && !editingName && <p className="mt-1 text-cp-small text-ink-soft">Saved.</p>}
      </div>
    </section>
  );
}
