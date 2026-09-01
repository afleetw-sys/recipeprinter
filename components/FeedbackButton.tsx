"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { submitPrinterFeedback, type FeedbackType } from "@/lib/feedback";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { Select } from "@/components/Select";
import { Dialog } from "@/components/Dialog";

const FEEDBACK_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "bug", label: "Bug" },
  { value: "print_issue", label: "Print issue" },
  { value: "other", label: "Other" },
];

const MESSAGE_PROMPTS: Record<FeedbackType, string> = {
  idea: "What should we do next?",
  bug: "What went wrong? A few details about what you expected and what happened helps a lot.",
  print_issue: "What looked off when you printed? Layout, missing text, page breaks, or anything else you noticed.",
  other: "What's on your mind?",
};

const EMAIL_HELP_TEXT: Record<FeedbackType, string> = {
  idea: "We'll only use this to follow up or let you know if your idea gets added.",
  bug: "We'll only use this if we need more detail or want to let you know the bug was fixed.",
  print_issue:
    "We'll only use this if we need a little more detail about the print problem or have a fix to share.",
  other: "We'll only use this if your note needs a reply.",
};

function pageContext() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${width}x${height}`,
    referrer: document.referrer,
  };
}

type FeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
  initialType?: FeedbackType;
};

export function FeedbackDialog({ open, onClose, initialType = "idea" }: FeedbackDialogProps) {
  const [type, setType] = useState<FeedbackType>(initialType);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const messageId = useId();
  const emailId = useId();
  const typeId = useId();
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  // Runs after the Dialog's own mount-time focus (which grabs the first
  // focusable element — the X close button) so the message field gets focus
  // instead, matching the previous autoFocus behavior.
  useEffect(() => {
    if (open) messageRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setSent(false);
    setError(null);
    setType(initialType);
  }, [initialType, open]);

  function close() {
    if (busy) return;
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const trimmedMessage = message.trim();
    const trimmedEmail = email.trim();
    if (trimmedMessage.length < 5) {
      setError("Write a little more first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submitPrinterFeedback({
        type,
        message: trimmedMessage,
        email: trimmedEmail,
        ...pageContext(),
      });
      setSent(true);
      setMessage("");
      setEmail("");
      setType(initialType);
    } catch {
      setError("Couldn't send feedback. Please try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      label="Give feedback"
      dismissOnBackdropClick
      portal
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal w-full sm:max-w-[460px] h-full sm:h-auto rounded-none border-0 sm:rounded-2xl sm:border p-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto"
    >
        <button
          type="button"
          className="absolute right-3 top-3 icon-close-btn"
          onClick={close}
          aria-label="Close"
          disabled={busy}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>

        <div className="pr-cp-7">
          <h3 className="font-extrabold text-cp-dialog-title">Give feedback</h3>
        </div>

        {sent ? (
          <div className="state state--success" role="status">
            <h4>Feedback sent</h4>
            <p>Thank you. This helps shape what gets improved next.</p>
          </div>
        ) : (
          <form className="flex flex-col gap-cp-3" onSubmit={handleSubmit}>
            <div>
              <label className="field-label" htmlFor={typeId}>
                Type
              </label>
              <Select
                id={typeId}
                className="field"
                value={type}
                onChange={(event) => setType(event.target.value as FeedbackType)}
                disabled={busy}
              >
                {FEEDBACK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="field-label" htmlFor={messageId}>
                Message
              </label>
              <textarea
                id={messageId}
                ref={messageRef}
                className="field"
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (error) setError(null);
                }}
                placeholder={MESSAGE_PROMPTS[type]}
                disabled={busy}
              />
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>

            <div>
              <label className="field-label" htmlFor={emailId}>
                Email (optional)
              </label>
              <input
                id={emailId}
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
              <p className="mt-2 text-cp-caption leading-relaxed text-ink-soft">
                {EMAIL_HELP_TEXT[type]}
              </p>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Send feedback
            </button>
          </form>
        )}

    </Dialog>
  );
}

type FeedbackButtonProps = {
  label?: string;
  className?: string;
  initialType?: FeedbackType;
};

export function FeedbackButton({
  label = "Give feedback",
  className = "text-cp-small font-semibold text-ink-soft hover:text-ink transition-colors",
  initialType,
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      <FeedbackDialog open={open} onClose={() => setOpen(false)} initialType={initialType} />
    </>
  );
}
