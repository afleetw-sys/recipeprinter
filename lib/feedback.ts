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
  const feedback = collection(getDb(), ...RECIPE_PRINTER_FEEDBACK_PATH);
  const doc = { ...input, email: input.email || null, status: "new", source, createdAt: serverTimestamp() };
  try {
    await addDoc(feedback, doc);
  } catch (error) {
    // Until firestore.rules with `import_issue` and the prompt sources is
    // deployed, the old rules refuse them. Send the note in the old shape
    // rather than lose it. Delete this once the rules are live.
    if ((error as { code?: string })?.code !== "permission-denied" || source === "recipeprinter-footer") throw error;
    await addDoc(feedback, {
      ...doc,
      type: input.type === "import_issue" ? "bug" : input.type,
      message: `[${source}] ${input.message}`.slice(0, 5000),
      source: "recipeprinter-footer",
    });
  }
  // Only the category — the message itself stays in Firestore, not analytics.
  track("feedback_submitted", { type: input.type, source });
}
