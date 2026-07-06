"use client";

import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import { CrownIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import type { PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const COFFEE_LOGO_SRC = "/images/buy-me-a-coffee-logo.png";

function accountLabelFor(user: User): string {
  return user.email || user.displayName || "your CookPilot account";
}

export function PrintDialogs({
  showDonateDialog,
  onCloseDonateDialog,
  onOpenFeedbackDialog,
  showUnlockDialog,
  onCloseUnlockDialog,
  selectedPremiumTemplate,
  selectedTemplateLabel,
  user,
  purchaseBusy,
  onUnlockTemplate,
  showSignInDialog,
  onCloseSignInDialog,
  onSignInSubmit,
  signInEmail,
  onSignInEmailChange,
  signInBusy,
  signInMessage,
}: {
  showDonateDialog: boolean;
  onCloseDonateDialog: () => void;
  onOpenFeedbackDialog: () => void;
  showUnlockDialog: boolean;
  onCloseUnlockDialog: () => void;
  selectedPremiumTemplate: PremiumRecipePrintTemplate | null;
  selectedTemplateLabel: string;
  user: User | null;
  purchaseBusy: boolean;
  onUnlockTemplate: (template: PremiumRecipePrintTemplate) => void;
  showSignInDialog: boolean;
  onCloseSignInDialog: () => void;
  onSignInSubmit: (event: FormEvent<HTMLFormElement>) => void;
  signInEmail: string;
  onSignInEmailChange: (value: string) => void;
  signInBusy: boolean;
  signInMessage: string | null;
}) {
  return (
    <>
      {showDonateDialog && (
        <div
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-success-title"
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseDonateDialog}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <div className="print-success-dialog__icon" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/recipeprinter-logo.png"
                alt=""
                className="print-success-dialog__logo"
                width={58}
                height={58}
              />
            </div>
            <h2 id="print-success-title">Ready for your counter, binder, or fridge door.</h2>
            <p>Support and feedback help me make RecipePrinter better.</p>
            <div className="print-success-dialog__actions">
              <a
                href={COFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={COFFEE_LOGO_SRC}
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5 rounded-full"
                  width={20}
                  height={20}
                />
                Support RecipePrinter
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onCloseDonateDialog();
                  onOpenFeedbackDialog();
                }}
              >
                Leave feedback
              </button>
            </div>
          </div>
        </div>
      )}
      {showUnlockDialog && selectedPremiumTemplate && user && (
        <div
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipeprinter-unlock-title"
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseUnlockDialog}
              disabled={purchaseBusy}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="recipeprinter-unlock-title">Unlock {selectedTemplateLabel} template?</h2>
            <p>
              You&apos;re logged in as <strong>{accountLabelFor(user)}</strong>. This purchase will
              be saved to that account so you can print with this template again.
            </p>
            <div className="print-success-dialog__actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={purchaseBusy}
                onClick={() => onUnlockTemplate(selectedPremiumTemplate)}
              >
                {purchaseBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <CrownIcon size={ICON_SIZE.md} />}
                Unlock & Print
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onCloseUnlockDialog}
                disabled={purchaseBusy}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {showSignInDialog && (
        <div
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipeprinter-sign-in-title"
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <form className="print-success-dialog__panel" onSubmit={onSignInSubmit}>
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseSignInDialog}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="recipeprinter-sign-in-title">
              Sign in so you can reuse this template forever.
            </h2>
            <p>Use your CookPilot login email if you have one.</p>
            <label className="field-label text-left mt-cp-4" htmlFor="recipeprinter-purchase-email">
              Email
            </label>
            <input
              id="recipeprinter-purchase-email"
              className="field"
              type="email"
              autoComplete="email"
              value={signInEmail}
              onChange={(event) => onSignInEmailChange(event.target.value)}
              disabled={signInBusy}
            />
            {signInMessage && <p className="recipe-template-note">{signInMessage}</p>}
            <div className="print-success-dialog__actions">
              <button type="submit" className="btn btn-primary" disabled={signInBusy}>
                {signInBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
                Send sign-in link
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCloseSignInDialog}>
                Not now
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
