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

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const trimmedName = displayName.trim();
  const nameUnchanged = trimmedName === (user.displayName ?? "").trim();

  async function saveName() {
    if (!trimmedName || nameUnchanged) return;
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await updateProfile(user, { displayName: trimmedName });
      refreshCookPilotAuthUser();
      setNameSaved(true);
    } catch (error) {
      setNameError(friendlyAuthError(error, "We couldn't save that name. Please try again."));
    } finally {
      setSavingName(false);
    }
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!user.email) return;
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSaved(false);
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
        <label className="field-label" htmlFor="account-display-name">
          Full name
        </label>
        <div className="flex flex-wrap items-start gap-cp-2">
          <input
            id="account-display-name"
            className="field min-w-48 flex-1"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              if (nameError) setNameError(null);
              setNameSaved(false);
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
        </div>
        {nameError && <p className="field-error" role="alert">{nameError}</p>}
        {nameSaved && !nameError && <p className="mt-1 text-cp-small text-ink-soft">Saved.</p>}
      </div>

      {hasPasswordProvider && (
        <form className="mt-cp-4 border-t border-line pt-cp-3" onSubmit={savePassword}>
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
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  if (passwordError) setPasswordError(null);
                  setPasswordSaved(false);
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
                  setPasswordSaved(false);
                }}
              />
            </div>
          </div>
          {passwordError && <p className="field-error" role="alert">{passwordError}</p>}
          {passwordSaved && !passwordError && (
            <p className="mt-1 text-cp-small text-ink-soft">Password changed.</p>
          )}
          <button
            type="submit"
            className="btn btn-secondary btn-compact mt-cp-2"
            disabled={!currentPassword || !newPassword || savingPassword}
          >
            {savingPassword ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
            Change password
          </button>
        </form>
      )}
    </section>
  );
}
