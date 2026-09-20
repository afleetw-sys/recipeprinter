import { deleteUser, signOut, type Auth, type User } from "firebase/auth";

/**
 * Cleaning up the anonymous session the email check borrows, without ever
 * signing anyone else out.
 *
 * `checkEmailProviders` signs in anonymously only to authorize one callable, and
 * then deletes that user. The SDK's `User.delete()` finishes with
 * `auth.signOut()`, and that signs out whoever is signed in AT THAT MOMENT, not
 * the user that was deleted. The delete was not awaited, so when it landed late
 * (a slow connection, or someone quick with a saved password) it landed on the
 * real account that had just been created or signed in to. The person was
 * signed out of an account that existed, and the next time through the form its
 * email was refused as already in use. Reproduced against the Auth emulator:
 * create succeeds, the late delete leaves `currentUser` null, and the second
 * create answers `auth/email-already-in-use`.
 *
 * Two guards, because either alone leaves a gap:
 *
 *  - `purgeAnonymousUser` does nothing when a different user is signed in.
 *    Better an orphaned anonymous record than a signed-out customer.
 *  - Whoever is about to sign in waits for the purge to finish first
 *    (`settleAnonymousPurge`), so it is not still running when they do.
 */
export async function purgeAnonymousUser(auth: Auth, user: User): Promise<void> {
  if (auth.currentUser && auth.currentUser.uid !== user.uid) return;
  await deleteUser(user).catch(async () => {
    // The user may have completed a real sign-in while best-effort anonymous
    // cleanup was running. Never let cleanup sign that newer user back out.
    if (auth.currentUser?.uid === user.uid) {
      await signOut(auth).catch(() => {});
    }
  });
}

let pendingPurge: Promise<void> = Promise.resolve();

/** Remember the purge that was just started, so a sign-in can wait for it. */
export function trackAnonymousPurge(purge: Promise<void>): void {
  pendingPurge = purge.catch(() => {});
}

/**
 * Resolves once the tracked purge is done, or after `timeoutMs`, whichever comes
 * first. It only ever delays a sign-in by the length of one small request, and a
 * hung connection must not be able to hold the form hostage.
 */
export async function settleAnonymousPurge(timeoutMs = 4000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([pendingPurge, timeout]);
  clearTimeout(timer);
}
