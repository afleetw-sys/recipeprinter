/**
 * Shares a link: the phone's own share sheet where there is one, otherwise a
 * copy to the clipboard. Says which happened, or null if neither did (the
 * share sheet closed without sharing counts as nothing).
 */
export async function shareLink(url: string, text: string): Promise<"native_share" | "copy" | null> {
  if (typeof navigator === "undefined") return null;
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, text });
      return "native_share";
    } catch {
      return null;
    }
  }
  return (await copyLink(url)) ? "copy" : null;
}

export async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
