"use client";

import { useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { refreshCookPilotAuthUser } from "@/components/CookPilotAuth";
import { ICON_SIZE, SpinnerIcon } from "@/components/icons";
import { friendlyAuthError } from "@/lib/friendlyErrors";

/**
 * Name and password, editable in place — the two things "Personal details"
 * means for an account with no other profile fields to speak of.
 *
 * Password only shows for an email/password account. Google and Apple
 * accounts have no RecipePrinter/CookPilot password to change — `user.providerData`
 * is what a signed-in `User` already carries its provider list on, the same
 * source `ensureRecipePrinterAccount` reads (`lib/firebase/recipePrinterAccount.ts`),
 * so this needs no extra read.
 */
export function AccountPersonalDetails({ user }: { user: User }) {
  const hasPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
  );

  /**
   * View by default, editable only after pressing Edit.
   *
   * A settings page opened to two live form fields the moment you landed on
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

  // Same reasoning as the name: collapsed until asked for, so landing on
  // Settings never shows two empty password fields for an account that
  // wasn't trying to change one.
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  function cancelChangingPassword() {
    setCurrentPassword("");
    setNewPassword("");
    setPasswordError(null);
    setChangingPassword(false);
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!user.email) return;
    setSavingPassword(true);
    setPasswordError(null);
    try {
      // `updatePassword` refuses a session that isn't "recent" — normal for
      // an account signed in for a while, not just a rare edge case — so this
      // reauthenticates with the current password first every time, rather
      // than only after seeing `auth/requires-recent-login` once.
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
      setChangingPassword(false);
    } catch (error) {
      setPasswordError(friendlyAuthError(error, "We couldn't change your password. Please try again."));
    } finally {
      setSavingPassword(false);
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
          <div className="flex flex-wrap items-center justify-between gap-cp-2">
            <p className="text-cp-body text-ink-soft">{user.displayName || "Not set"}</p>
            <button type="button" className="btn-ghost btn-compact" onClick={startEditingName}>
              Edit
            </button>
          </div>
        )}
        {nameSaved && !editingName && <p className="mt-1 text-cp-small text-ink-soft">Saved.</p>}
      </div>

      {hasPasswordProvider && (
        <div className="mt-cp-4 border-t border-line pt-cp-3">
          {changingPassword ? (
            <form onSubmit={savePassword}>
              <span className="text-cp-small font-bold text-ink">Change password</span>
              <div className="mt-cp-2 flex flex-col gap-cp-2">
                <div>
                  <label className="field-label" htmlFor="account-current-password">
                    Current password
                  </label>
                  <input
                    id="account-current-password"
                    className="field"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={currentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="account-new-password">
                    New password
                  </label>
                  <input
                    id="account-new-password"
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                  />
                </div>
              </div>
              {passwordError && <p className="field-error" role="alert">{passwordError}</p>}
              <div className="mt-cp-2 flex gap-cp-2">
                <button
                  type="submit"
                  className="btn btn-secondary btn-compact"
                  disabled={!currentPassword || !newPassword || savingPassword}
                >
                  {savingPassword ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
                  Change password
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-compact"
                  disabled={savingPassword}
                  onClick={cancelChangingPassword}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-cp-2">
              <span className="text-cp-small font-bold text-ink">Password</span>
              <button type="button" className="btn-ghost btn-compact" onClick={() => setChangingPassword(true)}>
                Change password
              </button>
            </div>
          )}
          {passwordSaved && !changingPassword && (
            <p className="mt-1 text-cp-small text-ink-soft">Password changed.</p>
          )}
        </div>
      )}
    </section>
  );
}
