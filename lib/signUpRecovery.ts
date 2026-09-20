/**
 * Creating an account must not be able to fail because it already worked.
 *
 * `createUserWithEmailAndPassword` is not repeatable: the second call for an
 * email answers `auth/email-already-in-use`, and it says so even when the
 * account it is refusing to create is the one the first call made a moment ago.
 * The form used to leave itself on screen, in its "create" step with the button
 * live again, while the host carried on with what the sign-up was for (the Pro
 * upgrade dialog starts checkout, which takes a while to open). Pressing the
 * button again in that gap is a natural thing to do, and it reported "an account
 * already uses that email" to someone who had just made it.
 *
 * So a refusal is only believed once we have checked it is not our own doing:
 *
 *  - Already signed in as that email: the earlier call won. That is success.
 *  - Otherwise the account really does exist, but the person typed a password
 *    and meant to get in. Try it. This also covers an existing account the
 *    email check routed to "create" by mistake.
 *  - Only if that password does not open it is it an honest "already exists".
 */

export type CreateAccountOutcome = "created" | "already-signed-in" | "signed-in-existing";

export function isEmailInUseError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.includes("email-already-in-use");
}

export async function createAccountOrRecover(
  deps: {
    create: () => Promise<unknown>;
    signIn: () => Promise<unknown>;
    /** The email of the real (non-anonymous) user signed in right now, if any. */
    currentUserEmail: () => string | null | undefined;
  },
  email: string,
): Promise<CreateAccountOutcome> {
  try {
    await deps.create();
    return "created";
  } catch (error) {
    if (!isEmailInUseError(error)) throw error;
    if (deps.currentUserEmail()?.trim().toLowerCase() === email.trim().toLowerCase()) {
      return "already-signed-in";
    }
    try {
      await deps.signIn();
      return "signed-in-existing";
    } catch {
      // Not our password, so this really is somebody's existing account. Report
      // the refusal we started with, not the sign-in failure that followed it.
      throw error;
    }
  }
}
