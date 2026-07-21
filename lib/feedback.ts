"use client";

export type FeedbackType = "idea" | "bug" | "print_issue" | "other";

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
}

export async function submitPrinterFeedback(input: FeedbackInput): Promise<void> {
  const [{ addDoc, collection, serverTimestamp }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await addDoc(collection(getDb(), "feedback-printer"), {
    ...input,
    email: input.email || null,
    status: "new",
    source: "recipeprinter-footer",
    createdAt: serverTimestamp(),
  });
}
