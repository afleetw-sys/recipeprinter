"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDb } from "@/lib/firebase/db";

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
  await addDoc(collection(getDb(), "feedback-printer"), {
    ...input,
    email: input.email || null,
    status: "new",
    source: "recipeprinter-footer",
    createdAt: serverTimestamp(),
  });
}
