/**
 * Noticing that a sign-in popup has been closed without waiting for Firebase to.
 *
 * `signInWithPopup` only learns the window was closed by polling for it every two
 * seconds (ten on mobile), and then waits a hard-coded further EIGHT seconds before
 * it rejects with `popup-closed-by-user`, in case sign-in is still finishing in
 * the background. Nothing in the public API shortens that. Awaiting it means a
 * dialog disabled for up to ten seconds after someone closes Google's window,
 * which reads as the app being stuck.
 *
 * We cannot see the popup, but we can see the page: while the popup is up it takes
 * focus from this window, and when it closes the focus comes back. So this waits
 * for that return and, after a short grace, says the popup is probably gone. The
 * grace is there because a popup that closes because sign-in SUCCEEDED does so
 * with the result about to arrive; if it does, the dialog is unmounted by the
 * account appearing, and freeing the buttons for that instant costs nothing.
 *
 * It only ever frees the UI. The sign-in itself is untouched and can still
 * complete, and the SDK's own rejection still arrives later, where the caller
 * treats it as the non-event it is (see `isPopupDismissal`).
 *
 * If the popup never took focus (some browsers open it without stealing it) no
 * return is ever seen, this never fires, and the SDK's own wait applies as before.
 */
export const POPUP_RETURN_GRACE_MS = 1_200;

export function watchForPopupReturn(
  onReturned: () => void,
  graceMs: number = POPUP_RETURN_GRACE_MS,
): () => void {
  if (typeof window === "undefined") return () => {};

  let popupTookFocus = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const returned = () => {
    if (done || !popupTookFocus || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      done = true;
      onReturned();
    }, graceMs);
  };
  const onBlur = () => {
    popupTookFocus = true;
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") popupTookFocus = true;
    else returned();
  };

  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", returned);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    done = true;
    if (timer !== null) clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", returned);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * The person closed the sign-in window, or started another sign-in over it. Not a
 * failure worth a message: they chose it, and the form is simply back to normal.
 */
export function isPopupDismissal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request"))
  );
}
