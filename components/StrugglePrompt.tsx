"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { track } from "@/lib/analytics";
import { submitPrinterFeedback } from "@/lib/feedback";
import { pageContext } from "@/components/FeedbackButton";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import {
  STRUGGLE_PROMPT_EVENT,
  markStrugglePromptShown,
  type StruggleKind,
} from "@/lib/strugglePrompt";

const COPY: Record<StruggleKind, { title: string; placeholder: string }> = {
  print: {
    title: "Was there a problem with your print?",
    placeholder: "Tell us what went wrong and we'll look into it.",
  },
  import: {
    title: "Having trouble importing this recipe?",
    placeholder: "Tell us what came in wrong or didn't come in at all.",
  },
};

/**
 * The corner card that asks what went wrong when a cook keeps printing the
 * same recipes or importing the same one (lib/strugglePrompt). Not a dialog:
 * nothing behind it is blocked, and the X puts it away.
 */
export function StrugglePrompt() {
  const [kind, setKind] = useState<StruggleKind | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fieldId = useId();
  const titleId = useId();
  const sentTimer = useRef<number | null>(null);

  useEffect(() => {
    function onRequest(event: Event) {
      const next = (event as CustomEvent<StruggleKind>).detail;
      setKind((current) => {
        if (current) return current;
        markStrugglePromptShown(next);
        track("feedback_prompt_shown", { trigger: next });
        return next;
      });
    }
    window.addEventListener(STRUGGLE_PROMPT_EVENT, onRequest);
    return () => {
      window.removeEventListener(STRUGGLE_PROMPT_EVENT, onRequest);
      if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
    };
  }, []);

  if (!kind) return null;

  function close() {
    if (busy || !kind) return;
    if (!sent) track("feedback_prompt_dismissed", { trigger: kind });
    setKind(null);
    setMessage("");
    setError(null);
    setSent(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !kind) return;
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setError("Write a little more first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitPrinterFeedback({
        type: kind === "print" ? "print_issue" : "import_issue",
        source: kind === "print" ? "repeat-print-prompt" : "repeat-import-prompt",
        message: trimmed,
        ...pageContext(),
      });
      setSent(true);
      setMessage("");
      sentTimer.current = window.setTimeout(() => setKind(null), 4000);
    } catch {
      setError("We couldn't send that. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[kind];
  return (
    <section className="struggle-prompt no-print" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <button type="button" className="struggle-prompt__close icon-close-btn" onClick={close} aria-label="Dismiss" disabled={busy}>
        <XIcon size={ICON_SIZE.sm} />
      </button>
      <h2 id={titleId} className="struggle-prompt__title">
        {copy.title}
      </h2>
      {sent ? (
        <p className="struggle-prompt__sent" role="status">
          Thanks. We read every one.
        </p>
      ) : (
        <form className="struggle-prompt__form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={fieldId}>
            {copy.title}
          </label>
          <textarea
            id={fieldId}
            className="field struggle-prompt__field"
            rows={3}
            maxLength={5000}
            value={message}
            placeholder={copy.placeholder}
            disabled={busy}
            onChange={(event) => {
              setMessage(event.target.value);
              if (error) setError(null);
            }}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary struggle-prompt__send" disabled={busy}>
            {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
            Send
          </button>
        </form>
      )}
    </section>
  );
}
