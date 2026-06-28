"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { submitPrinterFeedback, type FeedbackType } from "@/lib/feedback";
import { SpinnerIcon, XIcon } from "@/components/icons";

const FEEDBACK_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "bug", label: "Bug" },
  { value: "print_issue", label: "Print issue" },
  { value: "other", label: "Other" },
];

const MESSAGE_PROMPTS: Record<FeedbackType, string> = {
  idea: "What would you love RecipePrinter to do next?",
  bug: "What went wrong? A few details about what you expected and what happened helps a lot.",
  print_issue: "What looked off when you printed? Layout, missing text, page breaks, or anything else you noticed.",
  other: "What's on your mind?",
};

const EMAIL_HELP_TEXT: Record<FeedbackType, string> = {
  idea: "We'll only use this to ask a quick follow-up or let you know if your idea gets added.",
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

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const messageId = useId();
  const emailId = useId();
  const typeId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    if (busy) return;
    setOpen(false);
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
      setType("idea");
    } catch {
      setError("Couldn't send feedback. Please try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="text-[0.9rem] font-semibold text-ink-soft hover:text-ink transition-colors"
        onClick={() => {
          setOpen(true);
          setSent(false);
          setError(null);
        }}
      >
        Give feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-cp-4 py-cp-6"
          role="dialog"
          aria-modal="true"
          aria-label="Give feedback"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="panel w-full max-w-[460px] p-cp-5 flex flex-col gap-cp-4 relative">
            <button
              type="button"
              className="absolute right-3 top-3 btn-ghost btn-compact"
              onClick={close}
              aria-label="Close"
              disabled={busy}
            >
              <XIcon size={17} />
            </button>

            <div className="pr-cp-7">
              <h3 className="font-extrabold text-[1.05rem]">Give feedback</h3>
              <p className="text-[0.86rem] text-ink-soft mt-1">
                Share what would make RecipePrinter better.
              </p>
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
                  <select
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
                  </select>
                </div>

                <div>
                  <label className="field-label" htmlFor={messageId}>
                    Message
                  </label>
                  <textarea
                    id={messageId}
                    className="field"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={MESSAGE_PROMPTS[type]}
                    disabled={busy}
                    autoFocus
                  />
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
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-soft">
                    {EMAIL_HELP_TEXT[type]}
                  </p>
                </div>

                <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                  {busy ? <SpinnerIcon size={16} /> : null}
                  Send feedback
                </button>
              </form>
            )}

            {error && (
              <div className="state state--error" role="alert">
                <h4>Feedback wasn't sent</h4>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
