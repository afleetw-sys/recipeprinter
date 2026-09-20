import { deleteUser, signOut, type Auth, type User } from "firebase/auth";

/**
 * Deleting a stale anonymous session without ever signing anyone else out.
 *
 * The email check used to sign in anonymously just to be allowed to ask, then
 * delete that user in the background. It no longer does (the callable takes an
 * App Check attestation instead), but a browser that ran an older build can still
 * restore one, and this is what removes it.
 *
 * The SDK's `User.delete()` finishes with `auth.signOut()`, and that signs out
 * whoever is signed in AT THAT MOMENT, not the user that was deleted. So a delete
 * that lands after a real account has signed in signs that account out: the
 * person is signed out of an account that exists, and the next time through the
 * form its email is refused as already in use. Reproduced against the Auth
 * emulator (see lib/anonymousSession.emulator.test.ts). Hence the guard below:
 * do nothing when a different user is signed in. Better an orphaned anonymous
 * record than a signed-out customer.
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
