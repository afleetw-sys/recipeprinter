"use client";

import { track } from "@/lib/analytics";
import { RECIPE_PRINTER_FEEDBACK_PATH } from "@/lib/firebase/recipePrinterPaths";

export type FeedbackType = "idea" | "bug" | "print_issue" | "import_issue" | "other";

/** Where the note was written: the footer's dialog, or the corner card that
    asks after repeated prints or imports (components/StrugglePrompt). */
export type FeedbackSource = "recipeprinter-footer" | "repeat-print-prompt" | "repeat-import-prompt";

export interface FeedbackInput {
  type: FeedbackType;
  message: string;
  email?: string;
  pageUrl: string;
  pagePath: string;
  userAgent: string;
  language: string;
  viewport: string;
  referrer: string;
  source?: FeedbackSource;
}

export async function submitPrinterFeedback({ source = "recipeprinter-footer", ...input }: FeedbackInput): Promise<void> {
  const [{ addDoc, collection, serverTimestamp }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await addDoc(collection(getDb(), ...RECIPE_PRINTER_FEEDBACK_PATH), {
    ...input,
    email: input.email || null,
    status: "new",
    source,
    createdAt: serverTimestamp(),
  });
  // Only the category — the message itself stays in Firestore, not analytics.
  track("feedback_submitted", { type: input.type, source });
}
